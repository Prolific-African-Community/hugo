import {
  AppointmentSource,
  AppointmentStatus,
  CalendarConnectionStatus,
} from "@prisma/client";
import type { NextApiResponse } from "next";
import { jsonError, jsonSuccess } from "../../../../../lib/accounting-api";
import { AuthenticatedNextApiRequest, withAuth } from "../../../../../lib/auth";
import { requireHugoCabinet } from "../../../../../lib/hugo-auth";
import { matchPatientFromEventTitle } from "../../../../../lib/patient-matching";
import { prisma } from "../../../../../lib/prisma";

interface IcsEvent {
  uid: string | null;
  summary: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  description: string | null;
}

const AUTO_MATCH_THRESHOLD = 0.7;
const MAX_SYNC_EVENTS = 50;

const appointmentInclude = {
  patient: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
    },
  },
  session: {
    select: {
      id: true,
    },
  },
};

const getRequiredConnectionId = (req: AuthenticatedNextApiRequest) => {
  return typeof req.query.id === "string" && req.query.id.trim()
    ? req.query.id.trim()
    : null;
};

const serializeAppointment = <
  T extends { session?: { id: string } | null }
>(
  appointment: T
) => {
  const { session, ...rest } = appointment;

  return {
    ...rest,
    linkedSessionId: session?.id || null,
    hasSession: Boolean(session?.id),
  };
};

const toFetchableCalendarUrl = (calendarUrl: string) => {
  return calendarUrl.startsWith("webcal://")
    ? `https://${calendarUrl.slice("webcal://".length)}`
    : calendarUrl;
};

const unfoldIcs = (value: string) => value.replace(/\r?\n[ \t]/g, "");

const unescapeIcsText = (value: string) => {
  return value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
};

const getIcsValue = (block: string, property: string) => {
  const lines = block.split(/\r?\n/);
  const line = lines.find((item) => {
    const [left] = item.split(":", 1);
    return left?.split(";")[0]?.toUpperCase() === property;
  });

  if (!line) return null;

  const separatorIndex = line.indexOf(":");
  if (separatorIndex === -1) return null;

  return line.slice(separatorIndex + 1).trim();
};

const parseIcsDate = (value: string | null) => {
  if (!value) return null;

  const trimmed = value.trim();
  const dateOnly = trimmed.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dateOnly) {
    return new Date(
      Date.UTC(
        Number(dateOnly[1]),
        Number(dateOnly[2]) - 1,
        Number(dateOnly[3])
      )
    );
  }

  const dateTime = trimmed.match(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/
  );
  if (!dateTime) return null;

  const [, year, month, day, hour, minute, second, utc] = dateTime;

  if (utc === "Z") {
    return new Date(
      Date.UTC(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(minute),
        Number(second)
      )
    );
  }

  return new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second)
  );
};

const parseIcsEvents = (ics: string): IcsEvent[] => {
  const unfolded = unfoldIcs(ics);
  const blocks = unfolded.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) || [];

  return blocks.map((block) => ({
    uid: getIcsValue(block, "UID"),
    summary: unescapeIcsText(getIcsValue(block, "SUMMARY") || ""),
    startsAt: parseIcsDate(getIcsValue(block, "DTSTART")),
    endsAt: parseIcsDate(getIcsValue(block, "DTEND")),
    description: unescapeIcsText(getIcsValue(block, "DESCRIPTION") || ""),
  }));
};

const buildImportedNotes = ({
  uid,
  summary,
  description,
}: {
  uid: string;
  summary: string;
  description: string | null;
}) => {
  return [
    `[Apple Calendar UID:${uid}]`,
    `Titre: ${summary}`,
    description,
  ]
    .filter(Boolean)
    .join("\n");
};

const toSyncEventPayload = ({
  uid,
  summary,
  startsAt,
  endsAt,
  confidence,
  reason,
  patientName,
  appointmentId,
}: {
  uid: string | null;
  summary: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  confidence: number;
  reason: string;
  patientName: string | null;
  appointmentId: string | null;
}) => ({
  uid,
  summary,
  startsAt: startsAt?.toISOString() || null,
  endsAt: endsAt?.toISOString() || null,
  confidence,
  reason,
  patientName,
  appointmentId,
});

const syncCalendarConnection = async (
  req: AuthenticatedNextApiRequest,
  res: NextApiResponse
) => {
  const id = getRequiredConnectionId(req);
  const cabinet = await requireHugoCabinet(req);

  if (!id) {
    return jsonError(res, 400, "Calendar connection id is required");
  }

  if (!cabinet) {
    return jsonError(res, 404, "Cabinet not found");
  }

  const connection = await prisma.calendarConnection.findFirst({
    where: { id, entityId: cabinet.cabinetId },
    select: {
      id: true,
      calendarUrl: true,
    },
  });

  if (!connection) {
    return jsonError(res, 404, "Calendar connection not found");
  }

  try {
    const response = await fetch(toFetchableCalendarUrl(connection.calendarUrl));

    if (!response.ok) {
      throw new Error(`Calendar fetch failed with status ${response.status}`);
    }

    const ics = await response.text();
    const events = parseIcsEvents(ics).slice(0, MAX_SYNC_EVENTS);
    const patients = await prisma.patient.findMany({
      where: { entityId: cabinet.cabinetId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
      },
    });

    let importedCount = 0;
    let updatedCount = 0;
    let unmatchedCount = 0;
    let skippedCount = 0;
    const appointments = [];
    const recognizedEvents = [];
    const unmatchedEvents = [];
    const skippedEvents = [];

    for (const event of events) {
      const uid = event.uid?.trim();
      const summary = event.summary?.trim();

      if (!uid || !summary || !event.startsAt || !event.endsAt) {
        skippedCount += 1;
        skippedEvents.push(toSyncEventPayload({
          uid: uid || null,
          summary: summary || null,
          startsAt: event.startsAt,
          endsAt: event.endsAt,
          confidence: 0,
          reason: "VEVENT incomplet: UID, SUMMARY, DTSTART ou DTEND manquant",
          patientName: null,
          appointmentId: null,
        }));
        continue;
      }

      if (event.endsAt <= event.startsAt) {
        skippedCount += 1;
        skippedEvents.push(toSyncEventPayload({
          uid,
          summary,
          startsAt: event.startsAt,
          endsAt: event.endsAt,
          confidence: 0,
          reason: "VEVENT ignoré: DTEND doit être après DTSTART",
          patientName: null,
          appointmentId: null,
        }));
        continue;
      }

      const match = matchPatientFromEventTitle(summary, patients);
      const patient =
        match.patientId && match.confidence >= AUTO_MATCH_THRESHOLD
          ? patients.find((item) => item.id === match.patientId) || null
          : null;
      const notes = buildImportedNotes({
        uid,
        summary,
        description: event.description,
      });

      const existingAppointment = await prisma.appointment.findFirst({
        where: {
          entityId: cabinet.cabinetId,
          source: AppointmentSource.APPLE_CALENDAR,
          notes: {
            contains: `[Apple Calendar UID:${uid}]`,
          },
        },
        include: appointmentInclude,
      });

      if (!patient) {
        unmatchedCount += 1;
        unmatchedEvents.push(toSyncEventPayload({
          uid,
          summary,
          startsAt: event.startsAt,
          endsAt: event.endsAt,
          confidence: match.confidence,
          reason:
            match.confidence > 0
              ? `${match.reason}. Confiance trop faible pour créer automatiquement le rendez-vous.`
              : "Aucun patient reconnu.",
          patientName: null,
          appointmentId: null,
        }));
        continue;
      }

      if (existingAppointment) {
        const appointment = await prisma.appointment.update({
          where: { id: existingAppointment.id },
          data: {
            patientId: patient.id,
            startsAt: event.startsAt,
            endsAt: event.endsAt,
            status: AppointmentStatus.SCHEDULED,
            source: AppointmentSource.APPLE_CALENDAR,
            notes,
          },
          include: appointmentInclude,
        });

        updatedCount += 1;
        appointments.push({
          ...serializeAppointment(appointment),
          matchedAutomatically: true,
          confidence: match.confidence,
          reason: match.reason,
        });
        recognizedEvents.push(toSyncEventPayload({
          uid,
          summary,
          startsAt: event.startsAt,
          endsAt: event.endsAt,
          confidence: match.confidence,
          reason: match.reason,
          patientName: `${patient.firstName} ${patient.lastName}`.trim(),
          appointmentId: appointment.id,
        }));
        continue;
      }

      const appointment = await prisma.appointment.create({
        data: {
          entityId: cabinet.cabinetId,
          patientId: patient.id,
          startsAt: event.startsAt,
          endsAt: event.endsAt,
          status: AppointmentStatus.SCHEDULED,
          source: AppointmentSource.APPLE_CALENDAR,
          notes,
        },
        include: appointmentInclude,
      });

      importedCount += 1;
      appointments.push({
        ...serializeAppointment(appointment),
        matchedAutomatically: true,
        confidence: match.confidence,
        reason: match.reason,
      });
      recognizedEvents.push(toSyncEventPayload({
        uid,
        summary,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        confidence: match.confidence,
        reason: match.reason,
        patientName: `${patient.firstName} ${patient.lastName}`.trim(),
        appointmentId: appointment.id,
      }));
    }

    const updatedConnection = await prisma.calendarConnection.update({
      where: { id },
      data: {
        lastSyncedAt: new Date(),
        status: CalendarConnectionStatus.CONNECTED,
        lastError: null,
      },
      select: {
        id: true,
        status: true,
        lastSyncedAt: true,
        lastError: true,
      },
    });

    return jsonSuccess(res, {
      importedCount,
      updatedCount,
      unmatchedCount,
      skippedCount,
      appointments,
      recognizedEvents,
      unmatchedEvents,
      skippedEvents,
      connection: updatedConnection,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Calendar sync failed";

    await prisma.calendarConnection.update({
      where: { id },
      data: {
        status: CalendarConnectionStatus.ERROR,
        lastError: message,
      },
    });

    return jsonError(res, 502, message);
  }
};

export default withAuth(
  async (req: AuthenticatedNextApiRequest, res: NextApiResponse) => {
    try {
      if (req.method === "POST") {
        return await syncCalendarConnection(req, res);
      }

      return jsonError(res, 405, "Method not allowed");
    } catch (error) {
      console.error("HUGO CALENDAR CONNECTION SYNC ERROR:", error);
      return jsonError(res, 500, "Internal server error");
    }
  }
);
