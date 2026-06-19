import { AppointmentSource, AppointmentStatus } from "@prisma/client";
import type { NextApiResponse } from "next";
import { jsonError, jsonSuccess } from "../../../../lib/accounting-api";
import { AuthenticatedNextApiRequest, withAuth } from "../../../../lib/auth";
import { requireHugoCabinet } from "../../../../lib/hugo-auth";
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

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

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

const findPatientFromTitle = <
  T extends { id: string; firstName: string; lastName: string }
>(
  title: string,
  patients: T[]
) => {
  const normalizedTitle = normalize(title);

  return (
    patients.find((patient) => {
      const fullName = normalize(`${patient.firstName} ${patient.lastName}`);
      return fullName && normalizedTitle.includes(fullName);
    }) || null
  );
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

    const patient = findPatientFromTitle(title, patients);
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
        reason:
          "No matching patient found. Appointment.patientId is required in the current schema, so no appointment was created.",
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
      appointments.push(serializeAppointment(appointment));
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
    appointments.push(serializeAppointment(appointment));
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
