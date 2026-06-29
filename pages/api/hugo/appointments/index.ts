import {
  AppointmentSource,
  AppointmentStatus,
  CalendarEventSyncStatus,
  CalendarProvider,
  CalendarSyncActionStatus,
  CalendarSyncActionType,
} from "@prisma/client";
import type { NextApiResponse } from "next";
import {
  getOptionalString,
  getQueryString,
  jsonError,
  jsonSuccess,
} from "../../../../lib/accounting-api";
import { AuthenticatedNextApiRequest, withAuth } from "../../../../lib/auth";
import {
  APPOINTMENT_OVERLAP_MESSAGE,
  findAppointmentOverlap,
} from "../../../../lib/hugo-appointments";
import { requireHugoCabinet } from "../../../../lib/hugo-auth";
import { prisma } from "../../../../lib/prisma";

interface AppointmentBody {
  patientId?: unknown;
  startsAt?: unknown;
  endsAt?: unknown;
  status?: unknown;
  source?: unknown;
  notes?: unknown;
  calendarConnectionId?: unknown;
  externalEventId?: unknown;
}

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

const parseAppointmentStatus = (value: unknown): AppointmentStatus | null => {
  if (value === undefined || value === null || value === "") {
    return AppointmentStatus.SCHEDULED;
  }

  return typeof value === "string" &&
    Object.values(AppointmentStatus).includes(value as AppointmentStatus)
    ? (value as AppointmentStatus)
    : null;
};

const parseAppointmentSource = (value: unknown): AppointmentSource | null => {
  if (value === undefined || value === null || value === "") {
    return AppointmentSource.MANUAL;
  }

  return typeof value === "string" &&
    Object.values(AppointmentSource).includes(value as AppointmentSource)
    ? (value as AppointmentSource)
    : null;
};

const parseRequiredDate = (value: unknown) => {
  if (typeof value !== "string" || !value.trim()) return null;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getNullableString = (value: unknown) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const dateRangeForRange = (range: string | null) => {
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  if (range === "today") {
    const endOfToday = new Date(startOfToday);
    endOfToday.setDate(endOfToday.getDate() + 1);
    return { gte: startOfToday, lt: endOfToday };
  }

  if (range === "week") {
    const endOfWeek = new Date(startOfToday);
    endOfWeek.setDate(endOfWeek.getDate() + 7);
    return { gte: startOfToday, lt: endOfWeek };
  }

  return { gte: now };
};

const listAppointments = async (
  req: AuthenticatedNextApiRequest,
  res: NextApiResponse
) => {
  const cabinet = await requireHugoCabinet(req);

  if (!cabinet) {
    return jsonError(res, 404, "Cabinet not found");
  }

  const range =
    getQueryString(req.query.range) || getQueryString(req.query.filter);
  const patientId = getQueryString(req.query.patientId);

  if (patientId) {
    const patient = await prisma.patient.findFirst({
      where: { id: patientId, entityId: cabinet.cabinetId },
      select: { id: true },
    });

    if (!patient) {
      return jsonError(res, 404, "Patient not found");
    }
  }

  const appointments = await prisma.appointment.findMany({
    where: {
      entityId: cabinet.cabinetId,
      startsAt: dateRangeForRange(range),
      ...(patientId ? { patientId } : {}),
    },
    include: appointmentInclude,
    orderBy: { startsAt: "asc" },
    take: 100,
  });

  return jsonSuccess(res, appointments.map(serializeAppointment));
};

const createAppointment = async (
  req: AuthenticatedNextApiRequest,
  res: NextApiResponse
) => {
  const cabinet = await requireHugoCabinet(req);

  if (!cabinet) {
    return jsonError(res, 404, "Cabinet not found");
  }

  const body = req.body as AppointmentBody;
  const patientId = getOptionalString(body.patientId);
  const startsAt = parseRequiredDate(body.startsAt);
  const endsAt = parseRequiredDate(body.endsAt);
  const status = parseAppointmentStatus(body.status);
  const source = parseAppointmentSource(body.source);
  const calendarConnectionId = getOptionalString(body.calendarConnectionId);
  const externalEventId = getOptionalString(body.externalEventId);

  if (!patientId) {
    return jsonError(res, 400, "patientId is required");
  }

  if (!startsAt) {
    return jsonError(res, 400, "startsAt must be a valid date");
  }

  if (!endsAt) {
    return jsonError(res, 400, "endsAt must be a valid date");
  }

  if (endsAt <= startsAt) {
    return jsonError(res, 400, "endsAt must be after startsAt");
  }

  if (!status) {
    return jsonError(res, 400, "A valid appointment status is required");
  }

  if (!source) {
    return jsonError(res, 400, "A valid appointment source is required");
  }

  const patient = await prisma.patient.findFirst({
    where: { id: patientId, entityId: cabinet.cabinetId },
    select: { id: true },
  });

  if (!patient) {
    return jsonError(res, 404, "Patient not found");
  }

  if (source === AppointmentSource.MANUAL) {
    const overlap = await findAppointmentOverlap({
      cabinetId: cabinet.cabinetId,
      startsAt,
      endsAt,
    });

    if (overlap) {
      return jsonError(res, 409, APPOINTMENT_OVERLAP_MESSAGE);
    }
  }

  if ((calendarConnectionId && !externalEventId) || (!calendarConnectionId && externalEventId)) {
    return jsonError(
      res,
      400,
      "calendarConnectionId and externalEventId must be provided together"
    );
  }

  const calendarConnection = calendarConnectionId
    ? await prisma.calendarConnection.findFirst({
        where: {
          id: calendarConnectionId,
          entityId: cabinet.cabinetId,
        },
        select: { id: true, provider: true },
      })
    : null;

  if (calendarConnectionId && !calendarConnection) {
    return jsonError(res, 404, "Calendar connection not found");
  }

  const appointment = await prisma.$transaction(async (tx) => {
    const createdAppointment = await tx.appointment.create({
      data: {
        entityId: cabinet.cabinetId,
        patientId,
        startsAt,
        endsAt,
        status,
        source,
        notes: getNullableString(body.notes),
      },
      include: appointmentInclude,
    });

    if (calendarConnection && externalEventId) {
      await tx.calendarEventMapping.create({
        data: {
          entityId: cabinet.cabinetId,
          appointmentId: createdAppointment.id,
          calendarConnectionId: calendarConnection.id,
          provider: calendarConnection.provider,
          externalEventId,
          lastPulledAt: new Date(),
          syncStatus: CalendarEventSyncStatus.SYNCED,
        },
      });
    } else if (source === AppointmentSource.MANUAL) {
      const activeConnection = await tx.calendarConnection.findFirst({
        where: {
          entityId: cabinet.cabinetId,
          provider: CalendarProvider.APPLE_CALENDAR,
          status: "CONNECTED",
        },
        select: { id: true, provider: true },
      });

      if (activeConnection) {
        await tx.calendarSyncAction.create({
          data: {
            entityId: cabinet.cabinetId,
            appointmentId: createdAppointment.id,
            calendarConnectionId: activeConnection.id,
            provider: activeConnection.provider,
            actionType: CalendarSyncActionType.CREATE_EVENT,
            status: CalendarSyncActionStatus.PENDING,
            payload: {
              startsAt: startsAt.toISOString(),
              endsAt: endsAt.toISOString(),
              patientId,
              notes: getNullableString(body.notes),
            },
          },
        });
      }
    }

    return createdAppointment;
  });

  return jsonSuccess(res, serializeAppointment(appointment), 201);
};

export default withAuth(
  async (req: AuthenticatedNextApiRequest, res: NextApiResponse) => {
    try {
      if (req.method === "GET") {
        return await listAppointments(req, res);
      }

      if (req.method === "POST") {
        return await createAppointment(req, res);
      }

      return jsonError(res, 405, "Method not allowed");
    } catch (error) {
      console.error("HUGO APPOINTMENTS ERROR:", error);
      return jsonError(res, 500, "Internal server error");
    }
  }
);
