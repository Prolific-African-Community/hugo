import { AppointmentSource } from "@prisma/client";
import type { NextApiResponse } from "next";
import { jsonError, jsonSuccess } from "../../../../../lib/accounting-api";
import { AuthenticatedNextApiRequest, withAuth } from "../../../../../lib/auth";
import {
  APPOINTMENT_OVERLAP_MESSAGE,
  findAppointmentOverlap,
} from "../../../../../lib/hugo-appointments";
import { requireHugoCabinet } from "../../../../../lib/hugo-auth";
import { prisma } from "../../../../../lib/prisma";

interface RescheduleBody {
  startsAt?: unknown;
  endsAt?: unknown;
}

const EXTERNAL_SOURCE_MESSAGE =
  "Ce rendez-vous vient d’un calendrier externe. Modifiez-le dans Apple Calendar ou Doctena pour éviter une désynchronisation.";

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

const getRequiredAppointmentId = (req: AuthenticatedNextApiRequest) => {
  return typeof req.query.id === "string" && req.query.id.trim()
    ? req.query.id.trim()
    : null;
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

const rescheduleAppointment = async (
  req: AuthenticatedNextApiRequest,
  res: NextApiResponse
) => {
  const id = getRequiredAppointmentId(req);
  const cabinet = await requireHugoCabinet(req);
  const body = req.body as RescheduleBody;
  const startsAt = parseRequiredDate(body.startsAt);
  const endsAt = parseRequiredDate(body.endsAt);

  if (!id) {
    return jsonError(res, 400, "Appointment id is required");
  }

  if (!cabinet) {
    return jsonError(res, 404, "Cabinet not found");
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

  const appointment = await prisma.appointment.findFirst({
    where: {
      id,
      entityId: cabinet.cabinetId,
    },
    select: {
      id: true,
      source: true,
      session: {
        select: {
          id: true,
        },
      },
    },
  });

  if (!appointment) {
    return jsonError(res, 404, "Appointment not found");
  }

  if (appointment.source !== AppointmentSource.MANUAL) {
    return jsonError(res, 409, EXTERNAL_SOURCE_MESSAGE);
  }

  const overlap = await findAppointmentOverlap({
    cabinetId: cabinet.cabinetId,
    startsAt,
    endsAt,
    excludeAppointmentId: appointment.id,
  });

  if (overlap) {
    return jsonError(res, 409, APPOINTMENT_OVERLAP_MESSAGE);
  }

  const updatedAppointment = await prisma.$transaction(async (tx) => {
    const updated = await tx.appointment.update({
      where: { id: appointment.id },
      data: {
        startsAt,
        endsAt,
      },
      include: appointmentInclude,
    });

    if (appointment.session?.id) {
      await tx.therapySession.update({
        where: { id: appointment.session.id },
        data: {
          scheduledAt: startsAt,
        },
      });
    }

    return updated;
  });

  return jsonSuccess(res, {
    appointment: serializeAppointment(updatedAppointment),
    linkedSessionUpdated: Boolean(appointment.session?.id),
  });
};

export default withAuth(
  async (req: AuthenticatedNextApiRequest, res: NextApiResponse) => {
    try {
      if (req.method === "PATCH") {
        return await rescheduleAppointment(req, res);
      }

      return jsonError(res, 405, "Method not allowed");
    } catch (error) {
      console.error("HUGO APPOINTMENT RESCHEDULE ERROR:", error);
      return jsonError(res, 500, "Internal server error");
    }
  }
);
