import { AppointmentSource, AppointmentStatus } from "@prisma/client";
import type { NextApiResponse } from "next";
import { jsonError, jsonSuccess } from "../../../../lib/accounting-api";
import { AuthenticatedNextApiRequest, withAuth } from "../../../../lib/auth";
import { requireHugoCabinet } from "../../../../lib/hugo-auth";
import { matchPatientFromEventTitle } from "../../../../lib/patient-matching";
import { prisma } from "../../../../lib/prisma";

interface CalendarImportEvent {
  externalId?: unknown;
  title?: unknown;
  startsAt?: unknown;
  endsAt?: unknown;
  notes?: unknown;
}

interface CalendarImportBody {
  events?: unknown;
}

const patientSelect = {
  id: true,
  firstName: true,
  lastName: true,
};

const appointmentInclude = {
  patient: {
    select: patientSelect,
  },
  session: {
    select: {
      id: true,
    },
  },
};

const AUTO_MATCH_THRESHOLD = 0.7;

const parseRequiredString = (value: unknown) => {
  return typeof value === "string" && value.trim() ? value.trim() : null;
};

const parseOptionalString = (value: unknown) => {
  if (value === undefined || value === null) return null;
  return typeof value === "string" && value.trim() ? value.trim() : null;
};

const parseRequiredDate = (value: unknown) => {
  if (typeof value !== "string" || !value.trim()) return null;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
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

const buildImportedNotes = ({
  externalId,
  title,
  notes,
  unmatched,
}: {
  externalId: string;
  title: string;
  notes: string | null;
  unmatched?: boolean;
}) => {
  const parts = [
    `[Apple Calendar mock:${externalId}]`,
    `Titre: ${title}`,
    unmatched ? "Patient à identifier" : null,
    notes,
  ].filter(Boolean);

  return parts.join("\n");
};

const importCalendarEvents = async (
  req: AuthenticatedNextApiRequest,
  res: NextApiResponse
) => {
  const cabinet = await requireHugoCabinet(req);

  if (!cabinet) {
    return jsonError(res, 404, "Cabinet not found");
  }

  const body = req.body as CalendarImportBody;

  if (!Array.isArray(body.events)) {
    return jsonError(res, 400, "events must be an array");
  }

  const patients = await prisma.patient.findMany({
    where: { entityId: cabinet.cabinetId },
    select: patientSelect,
  });

  let importedCount = 0;
  let updatedCount = 0;
  let unmatchedCount = 0;
  const appointments = [];
  const unmatchedEvents = [];

  for (const rawEvent of body.events as CalendarImportEvent[]) {
    const externalId = parseRequiredString(rawEvent.externalId);
    const title = parseRequiredString(rawEvent.title);
    const startsAt = parseRequiredDate(rawEvent.startsAt);
    const endsAt = parseRequiredDate(rawEvent.endsAt);
    const notes = parseOptionalString(rawEvent.notes);

    if (!externalId || !title || !startsAt || !endsAt) {
      return jsonError(
        res,
        400,
        "Each event requires externalId, title, startsAt and endsAt"
      );
    }

    if (endsAt <= startsAt) {
      return jsonError(res, 400, "Each event endsAt must be after startsAt");
    }

    const match = matchPatientFromEventTitle(title, patients);
    const patient =
      match.patientId && match.confidence >= AUTO_MATCH_THRESHOLD
        ? patients.find((item) => item.id === match.patientId) || null
        : null;
    const importedNotes = buildImportedNotes({
      externalId,
      title,
      notes,
      unmatched: !patient,
    });

    const existingAppointment = await prisma.appointment.findFirst({
      where: {
        entityId: cabinet.cabinetId,
        source: AppointmentSource.APPLE_CALENDAR,
        startsAt,
        endsAt,
        notes: {
          contains: `[Apple Calendar mock:${externalId}]`,
        },
      },
      include: appointmentInclude,
    });

    if (!patient) {
      unmatchedCount += 1;
      unmatchedEvents.push({
        externalId,
        title,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        notes: importedNotes,
        matchedAutomatically: false,
        confidence: match.confidence,
        reason:
          match.confidence > 0
            ? `${match.reason}. Confiance trop faible pour créer automatiquement le rendez-vous.`
            : "Aucun patient reconnu. Appointment.patientId est obligatoire dans le schéma actuel, donc aucun rendez-vous n'a été créé.",
      });
      continue;
    }

    if (existingAppointment) {
      const appointment = await prisma.appointment.update({
        where: { id: existingAppointment.id },
        data: {
          patientId: patient.id,
          startsAt,
          endsAt,
          status: AppointmentStatus.SCHEDULED,
          source: AppointmentSource.APPLE_CALENDAR,
          notes: importedNotes,
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
      continue;
    }

    const appointment = await prisma.appointment.create({
      data: {
        entityId: cabinet.cabinetId,
        patientId: patient.id,
        startsAt,
        endsAt,
        status: AppointmentStatus.SCHEDULED,
        source: AppointmentSource.APPLE_CALENDAR,
        notes: importedNotes,
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
  }

  return jsonSuccess(res, {
    importedCount,
    updatedCount,
    unmatchedCount,
    appointments,
    unmatchedEvents,
  });
};

export default withAuth(
  async (req: AuthenticatedNextApiRequest, res: NextApiResponse) => {
    try {
      if (req.method === "POST") {
        return await importCalendarEvents(req, res);
      }

      return jsonError(res, 405, "Method not allowed");
    } catch (error) {
      console.error("HUGO CALENDAR IMPORT MOCK ERROR:", error);
      return jsonError(res, 500, "Internal server error");
    }
  }
);
