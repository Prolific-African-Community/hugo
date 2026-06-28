import {
  AppointmentSource,
  AppointmentStatus,
  CalendarEventSyncStatus,
  CalendarSyncActionStatus,
  CalendarSyncActionType,
} from "@prisma/client";
import type { NextApiResponse } from "next";
import {
  getOptionalString,
  jsonError,
  jsonSuccess,
} from "../../../../lib/accounting-api";
import { AuthenticatedNextApiRequest, withAuth } from "../../../../lib/auth";
import { requireHugoCabinet } from "../../../../lib/hugo-auth";
import { prisma } from "../../../../lib/prisma";

interface UpdateAppointmentBody {
  patientId?: unknown;
  startsAt?: unknown;
  endsAt?: unknown;
  status?: unknown;
  source?: unknown;
  notes?: unknown;
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

const getRequiredAppointmentId = (req: AuthenticatedNextApiRequest) => {
  return typeof req.query.id === "string" && req.query.id.trim()
    ? req.query.id.trim()
    : null;
};

const parseAppointmentStatus = (
  value: unknown
): AppointmentStatus | undefined | null => {
  if (value === undefined) return undefined;

  return typeof value === "string" &&
    Object.values(AppointmentStatus).includes(value as AppointmentStatus)
    ? (value as AppointmentStatus)
    : null;
};

const parseAppointmentSource = (
  value: unknown
): AppointmentSource | undefined | null => {
  if (value === undefined) return undefined;

  return typeof value === "string" &&
    Object.values(AppointmentSource).includes(value as AppointmentSource)
    ? (value as AppointmentSource)
    : null;
};

const parseOptionalDate = (value: unknown) => {
  if (value === undefined) return undefined;
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

const getAppointment = async (
  req: AuthenticatedNextApiRequest,
  res: NextApiResponse
) => {
  const id = getRequiredAppointmentId(req);
  const cabinet = await requireHugoCabinet(req);

  if (!id) {
    return jsonError(res, 400, "Appointment id is required");
  }

  if (!cabinet) {
    return jsonError(res, 404, "Cabinet not found");
  }

  const appointment = await prisma.appointment.findFirst({
    where: { id, entityId: cabinet.cabinetId },
    include: appointmentInclude,
  });

  if (!appointment) {
    return jsonError(res, 404, "Appointment not found");
  }

  return jsonSuccess(res, serializeAppointment(appointment));
};

const updateAppointment = async (
  req: AuthenticatedNextApiRequest,
  res: NextApiResponse
) => {
  const id = getRequiredAppointmentId(req);
  const cabinet = await requireHugoCabinet(req);

  if (!id) {
    return jsonError(res, 400, "Appointment id is required");
  }

  if (!cabinet) {
    return jsonError(res, 404, "Cabinet not found");
  }

  const body = req.body as UpdateAppointmentBody;
  const patientId = getOptionalString(body.patientId);
  const startsAt = parseOptionalDate(body.startsAt);
  const endsAt = parseOptionalDate(body.endsAt);
  const status = parseAppointmentStatus(body.status);
  const source = parseAppointmentSource(body.source);

  if (startsAt === null) {
    return jsonError(res, 400, "startsAt must be a valid date");
  }

  if (endsAt === null) {
    return jsonError(res, 400, "endsAt must be a valid date");
  }

  if (status === null) {
    return jsonError(res, 400, "A valid appointment status is required");
  }

  if (source === null) {
    return jsonError(res, 400, "A valid appointment source is required");
  }

  const existingAppointment = await prisma.appointment.findFirst({
    where: { id, entityId: cabinet.cabinetId },
    select: {
      id: true,
      patientId: true,
      startsAt: true,
      endsAt: true,
      calendarEventMapping: {
        select: {
          id: true,
          calendarConnectionId: true,
          provider: true,
        },
      },
    },
  });

  if (!existingAppointment) {
    return jsonError(res, 404, "Appointment not found");
  }

  const nextPatientId = patientId || existingAppointment.patientId;
  const nextStartsAt = startsAt ?? existingAppointment.startsAt;
  const nextEndsAt = endsAt ?? existingAppointment.endsAt;

  if (nextEndsAt <= nextStartsAt) {
    return jsonError(res, 400, "endsAt must be after startsAt");
  }

  if (patientId) {
    const patient = await prisma.patient.findFirst({
      where: { id: nextPatientId, entityId: cabinet.cabinetId },
      select: { id: true },
    });

    if (!patient) {
      return jsonError(res, 404, "Patient not found");
    }
  }

  const nextNotes = getNullableString(body.notes);

  const appointment = await prisma.$transaction(async (tx) => {
    const updatedAppointment = await tx.appointment.update({
      where: { id },
      data: {
        ...(patientId ? { patientId: nextPatientId } : {}),
        ...(startsAt !== undefined ? { startsAt: nextStartsAt } : {}),
        ...(endsAt !== undefined ? { endsAt: nextEndsAt } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(source !== undefined ? { source } : {}),
        ...(nextNotes !== undefined ? { notes: nextNotes } : {}),
      },
      include: appointmentInclude,
    });

    if (existingAppointment.calendarEventMapping) {
      await tx.calendarEventMapping.update({
        where: { id: existingAppointment.calendarEventMapping.id },
        data: {
          syncStatus: CalendarEventSyncStatus.LOCAL_PENDING,
          lastSyncError: null,
        },
      });

      await tx.calendarSyncAction.create({
        data: {
          entityId: cabinet.cabinetId,
          appointmentId: existingAppointment.id,
          calendarConnectionId:
            existingAppointment.calendarEventMapping.calendarConnectionId,
          mappingId: existingAppointment.calendarEventMapping.id,
          provider: existingAppointment.calendarEventMapping.provider,
          actionType: CalendarSyncActionType.UPDATE_EVENT,
          status: CalendarSyncActionStatus.PENDING,
          payload: {
            startsAt: nextStartsAt.toISOString(),
            endsAt: nextEndsAt.toISOString(),
            patientId: nextPatientId,
            notes: nextNotes,
          },
        },
      });
    }

    return updatedAppointment;
  });

  return jsonSuccess(res, serializeAppointment(appointment));
};

const deleteAppointment = async (
  req: AuthenticatedNextApiRequest,
  res: NextApiResponse
) => {
  const id = getRequiredAppointmentId(req);
  const cabinet = await requireHugoCabinet(req);

  if (!id) {
    return jsonError(res, 400, "Appointment id is required");
  }

  if (!cabinet) {
    return jsonError(res, 404, "Cabinet not found");
  }

  const appointment = await prisma.appointment.findFirst({
    where: { id, entityId: cabinet.cabinetId },
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      notes: true,
      calendarEventMapping: {
        select: {
          id: true,
          calendarConnectionId: true,
          externalEtag: true,
          externalEventId: true,
          provider: true,
        },
      },
      patient: {
        select: {
          firstName: true,
          lastName: true,
        },
      },
    },
  });

  if (!appointment) {
    return jsonError(res, 404, "Appointment not found");
  }

  await prisma.$transaction(async (tx) => {
    if (appointment.calendarEventMapping) {
      const patientName =
        `${appointment.patient.firstName} ${appointment.patient.lastName}`.trim();

      await tx.calendarSyncAction.create({
        data: {
          entityId: cabinet.cabinetId,
          appointmentId: appointment.id,
          calendarConnectionId:
            appointment.calendarEventMapping.calendarConnectionId,
          mappingId: appointment.calendarEventMapping.id,
          provider: appointment.calendarEventMapping.provider,
          actionType: CalendarSyncActionType.DELETE_EVENT,
          status: CalendarSyncActionStatus.PENDING,
          payload: {
            externalEventId: appointment.calendarEventMapping.externalEventId,
            etag: appointment.calendarEventMapping.externalEtag,
            startsAt: appointment.startsAt.toISOString(),
            endsAt: appointment.endsAt.toISOString(),
            title: patientName ? `Rendez-vous - ${patientName}` : "Rendez-vous Hugo",
            patientName,
            notes: appointment.notes,
          },
        },
      });
    }

    await tx.appointment.delete({ where: { id } });
  });

  return jsonSuccess(res, { id });
};

export default withAuth(
  async (req: AuthenticatedNextApiRequest, res: NextApiResponse) => {
    try {
      if (req.method === "GET") {
        return await getAppointment(req, res);
      }

      if (req.method === "PATCH") {
        return await updateAppointment(req, res);
      }

      if (req.method === "DELETE") {
        return await deleteAppointment(req, res);
      }

      return jsonError(res, 405, "Method not allowed");
    } catch (error) {
      console.error("HUGO APPOINTMENT ERROR:", error);
      return jsonError(res, 500, "Internal server error");
    }
  }
);
