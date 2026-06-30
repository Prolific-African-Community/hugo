import {
  CalendarEventSyncStatus,
  CalendarSyncActionStatus,
  CalendarSyncActionType,
} from "@prisma/client";
import type { NextApiResponse } from "next";
import { jsonError, jsonSuccess } from "../../../../../lib/accounting-api";
import { AuthenticatedNextApiRequest, withAuth } from "../../../../../lib/auth";
import {
  APPOINTMENT_OVERLAP_MESSAGE,
  findAppointmentOverlap,
} from "../../../../../lib/hugo-appointments";
import { cleanCalendarNotes } from "../../../../../lib/hugo-display";
import { requireHugoCabinet } from "../../../../../lib/hugo-auth";
import { prisma } from "../../../../../lib/prisma";

interface RescheduleBody {
  startsAt?: unknown;
  endsAt?: unknown;
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

  // Charger STRICTEMENT le rendez-vous existant (jamais de creation ici).
  const appointment = await prisma.appointment.findFirst({
    where: {
      id,
      entityId: cabinet.cabinetId,
    },
    select: {
      id: true,
      patientId: true,
      notes: true,
      session: {
        select: {
          id: true,
        },
      },
      // Mapping Apple Calendar : si present, le deplacement prepare un push
      // UPDATE_EVENT (traite par la queue/cron) sur le MEME evenement externe.
      calendarEventMapping: {
        select: {
          id: true,
          calendarConnectionId: true,
          provider: true,
          externalEventId: true,
        },
      },
    },
  });

  if (!appointment) {
    return jsonError(res, 404, "Appointment not found");
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

  const mapping = appointment.calendarEventMapping;
  const linkedSessionUpdated = Boolean(appointment.session?.id);
  const calendarSyncQueued = Boolean(mapping);

  const { updated, cancelledObsoleteActionsCount } = await prisma.$transaction(
    async (tx) => {
      // 1. Update PUR du seul Appointment existant (startsAt / endsAt).
      const updatedAppointment = await tx.appointment.update({
        where: { id: appointment.id },
        data: {
          startsAt,
          endsAt,
        },
        include: appointmentInclude,
      });

      // 2. La seance liee suit le nouveau creneau.
      if (appointment.session?.id) {
        await tx.therapySession.update({
          where: { id: appointment.session.id },
          data: {
            scheduledAt: startsAt,
          },
        });
      }

      let cancelledCount = 0;

      // 3. Preparer le push Apple Calendar uniquement si le rendez-vous est
      //    deja mappe (on ne cree jamais de CREATE_EVENT ici).
      if (mapping) {
        // 3a. Annuler les actions obsoletes du MEME rendez-vous (CREATE/UPDATE
        //     encore PENDING/FAILED) pour eviter qu'une vieille action soit
        //     poussee apres le nouveau deplacement. On ne touche pas aux
        //     DELETE_EVENT.
        const cancelled = await tx.calendarSyncAction.updateMany({
          where: {
            appointmentId: appointment.id,
            actionType: {
              in: [
                CalendarSyncActionType.CREATE_EVENT,
                CalendarSyncActionType.UPDATE_EVENT,
              ],
            },
            status: {
              in: [
                CalendarSyncActionStatus.PENDING,
                CalendarSyncActionStatus.FAILED,
              ],
            },
          },
          data: {
            status: CalendarSyncActionStatus.CANCELLED,
            error: "Annulée: rendez-vous déplacé (action obsolète).",
            processedAt: new Date(),
          },
        });
        cancelledCount = cancelled.count;

        // 3b. Conserver le meme mapping, le marquer LOCAL_PENDING.
        await tx.calendarEventMapping.update({
          where: { id: mapping.id },
          data: {
            syncStatus: CalendarEventSyncStatus.LOCAL_PENDING,
            lastSyncError: null,
          },
        });

        // 3c. Une SEULE nouvelle action UPDATE_EVENT, avec l'externalEventId
        //     existant pour cibler le meme evenement Apple Calendar.
        await tx.calendarSyncAction.create({
          data: {
            entityId: cabinet.cabinetId,
            appointmentId: appointment.id,
            calendarConnectionId: mapping.calendarConnectionId,
            mappingId: mapping.id,
            provider: mapping.provider,
            actionType: CalendarSyncActionType.UPDATE_EVENT,
            status: CalendarSyncActionStatus.PENDING,
            payload: {
              startsAt: startsAt.toISOString(),
              endsAt: endsAt.toISOString(),
              appointmentId: appointment.id,
              mappingId: mapping.id,
              externalEventId: mapping.externalEventId,
              patientId: appointment.patientId,
              notes: cleanCalendarNotes(appointment.notes),
            },
          },
        });
      }

      return {
        updated: updatedAppointment,
        cancelledObsoleteActionsCount: cancelledCount,
      };
    }
  );

  return jsonSuccess(res, {
    appointment: serializeAppointment(updated),
    linkedSessionUpdated,
    calendarSyncQueued,
    debug: {
      appointmentId: appointment.id,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      linkedSessionUpdated,
      calendarSyncQueued,
      cancelledObsoleteActionsCount,
    },
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
