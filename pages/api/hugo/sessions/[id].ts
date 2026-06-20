import {
  AppointmentSource,
  AppointmentStatus,
  TherapySessionStatus,
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
  getDefaultAppointmentEnd,
} from "../../../../lib/hugo-appointments";
import { requireHugoCabinet } from "../../../../lib/hugo-auth";
import { prisma } from "../../../../lib/prisma";

interface UpdateSessionBody {
  entityId?: unknown;
  patientId?: unknown;
  prescriptionId?: unknown;
  sessionNumber?: unknown;
  scheduledAt?: unknown;
  completedAt?: unknown;
  status?: unknown;
  notes?: unknown;
}

const sessionInclude = {
  patient: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
    },
  },
  prescription: {
    select: {
      id: true,
      title: true,
      prescribedSessions: true,
      completedSessions: true,
      status: true,
    },
  },
  appointment: {
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      status: true,
      source: true,
    },
  },
};

const parseSessionStatus = (
  value: unknown
): TherapySessionStatus | undefined | null => {
  if (value === undefined) return undefined;

  return typeof value === "string" &&
    Object.values(TherapySessionStatus).includes(value as TherapySessionStatus)
    ? (value as TherapySessionStatus)
    : null;
};

const parseOptionalPositiveInteger = (value: unknown) => {
  if (value === undefined) return undefined;

  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
      ? Number(value)
      : NaN;

  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const parseNullableDate = (value: unknown) => {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string") return undefined;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

const getNullableString = (value: unknown) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const getRequiredSessionId = (req: AuthenticatedNextApiRequest) => {
  return typeof req.query.id === "string" && req.query.id.trim()
    ? req.query.id.trim()
    : null;
};

const recomputePrescriptionCompletedSessions = async (
  prescriptionId: string,
  cabinetId: string
) => {
  const completedSessions = await prisma.therapySession.count({
    where: {
      entityId: cabinetId,
      prescriptionId,
      status: TherapySessionStatus.COMPLETED,
    },
  });

  await prisma.prescription.updateMany({
    where: {
      id: prescriptionId,
      entityId: cabinetId,
    },
    data: {
      completedSessions,
    },
  });

  return completedSessions;
};

const getSession = async (
  req: AuthenticatedNextApiRequest,
  res: NextApiResponse
) => {
  const id = getRequiredSessionId(req);
  const entityId = getQueryString(req.query.entityId);

  if (!id) {
    return jsonError(res, 400, "Session id is required");
  }

  if (!entityId) {
    return jsonError(res, 400, "entityId is required");
  }

  const cabinet = await requireHugoCabinet(req);
  if (!cabinet || cabinet.cabinetId !== entityId) {
    return jsonError(res, 403, "Forbidden");
  }

  const session = await prisma.therapySession.findFirst({
    where: { id, entityId },
    include: sessionInclude,
  });

  if (!session) {
    return jsonError(res, 404, "Session not found");
  }

  return jsonSuccess(res, session);
};

const updateSession = async (
  req: AuthenticatedNextApiRequest,
  res: NextApiResponse
) => {
  const id = getRequiredSessionId(req);
  const body = req.body as UpdateSessionBody;
  const entityId = getOptionalString(body.entityId);
  const patientId = getOptionalString(body.patientId);
  const prescriptionId = getOptionalString(body.prescriptionId);
  const sessionNumber = parseOptionalPositiveInteger(body.sessionNumber);
  const scheduledAt = parseNullableDate(body.scheduledAt);
  const completedAt = parseNullableDate(body.completedAt);
  const status = parseSessionStatus(body.status);

  if (!id) {
    return jsonError(res, 400, "Session id is required");
  }

  if (!entityId) {
    return jsonError(res, 400, "entityId is required");
  }

  const cabinet = await requireHugoCabinet(req);
  if (!cabinet || cabinet.cabinetId !== entityId) {
    return jsonError(res, 403, "Forbidden");
  }

  if (sessionNumber === null) {
    return jsonError(
      res,
      400,
      "sessionNumber must be an integer greater than 0"
    );
  }

  if (status === null) {
    return jsonError(res, 400, "A valid therapy session status is required");
  }

  if (scheduledAt === undefined && body.scheduledAt !== undefined) {
    return jsonError(res, 400, "scheduledAt must be a valid date");
  }

  if (completedAt === undefined && body.completedAt !== undefined) {
    return jsonError(res, 400, "completedAt must be a valid date");
  }

  const existingSession = await prisma.therapySession.findFirst({
    where: { id, entityId },
    select: {
      id: true,
      patientId: true,
      prescriptionId: true,
      appointmentId: true,
      sessionNumber: true,
      scheduledAt: true,
    },
  });

  if (!existingSession) {
    return jsonError(res, 404, "Session not found");
  }

  const nextPatientId = patientId || existingSession.patientId;
  const nextPrescriptionId = prescriptionId || existingSession.prescriptionId;

  if (!nextPrescriptionId) {
    return jsonError(res, 400, "prescriptionId is required");
  }

  const patient = await prisma.patient.findFirst({
    where: { id: nextPatientId, entityId },
    select: { id: true },
  });

  if (!patient) {
    return jsonError(res, 404, "Patient not found");
  }

  const prescription = await prisma.prescription.findFirst({
    where: { id: nextPrescriptionId, entityId },
    select: { id: true, patientId: true, prescribedSessions: true },
  });

  if (!prescription) {
    return jsonError(res, 404, "Prescription not found");
  }

  if (prescription.patientId !== nextPatientId) {
    return jsonError(
      res,
      400,
      "Prescription does not belong to the selected patient"
    );
  }

  const nextSessionNumber = sessionNumber ?? existingSession.sessionNumber;

  if (nextSessionNumber > prescription.prescribedSessions) {
    return jsonError(res, 400, "sessionNumber cannot exceed prescribedSessions");
  }

  const duplicateSession = await prisma.therapySession.findFirst({
    where: {
      entityId,
      prescriptionId: nextPrescriptionId,
      sessionNumber: nextSessionNumber,
      NOT: { id },
    },
    select: { id: true },
  });

  if (duplicateSession) {
    return jsonError(
      res,
      409,
      "A session with this number already exists for this prescription"
    );
  }

  let linkedAppointmentId = existingSession.appointmentId;
  const shouldSyncAppointment = scheduledAt !== undefined && Boolean(scheduledAt);

  if (shouldSyncAppointment && scheduledAt) {
    const appointmentEndsAt = getDefaultAppointmentEnd(scheduledAt);
    const overlap = await findAppointmentOverlap({
      cabinetId: entityId,
      startsAt: scheduledAt,
      endsAt: appointmentEndsAt,
      excludeAppointmentId: existingSession.appointmentId,
    });

    if (overlap) {
      return jsonError(res, 409, APPOINTMENT_OVERLAP_MESSAGE);
    }
  }

  const nextNotes = getNullableString(body.notes);

  const session = await prisma.$transaction(async (tx) => {
    if (shouldSyncAppointment && scheduledAt) {
      if (existingSession.appointmentId) {
        await tx.appointment.updateMany({
          where: {
            id: existingSession.appointmentId,
            entityId,
          },
          data: {
            patientId: nextPatientId,
            startsAt: scheduledAt,
            endsAt: getDefaultAppointmentEnd(scheduledAt),
          },
        });
      } else {
        const appointment = await tx.appointment.create({
          data: {
            entityId,
            patientId: nextPatientId,
            startsAt: scheduledAt,
            endsAt: getDefaultAppointmentEnd(scheduledAt),
            status: AppointmentStatus.SCHEDULED,
            source: AppointmentSource.MANUAL,
            notes: "Créé depuis séance",
          },
          select: { id: true },
        });
        linkedAppointmentId = appointment.id;
      }
    } else if (existingSession.appointmentId && patientId) {
      await tx.appointment.updateMany({
        where: {
          id: existingSession.appointmentId,
          entityId,
        },
        data: {
          patientId: nextPatientId,
        },
      });
    }

    return tx.therapySession.update({
      where: { id },
      data: {
        ...(patientId ? { patientId: nextPatientId } : {}),
        ...(prescriptionId ? { prescriptionId: nextPrescriptionId } : {}),
        ...(linkedAppointmentId !== existingSession.appointmentId
          ? { appointmentId: linkedAppointmentId }
          : {}),
        ...(sessionNumber !== undefined ? { sessionNumber } : {}),
        ...(scheduledAt !== undefined ? { scheduledAt } : {}),
        ...(completedAt !== undefined ? { completedAt } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(nextNotes !== undefined ? { notes: nextNotes } : {}),
      },
      include: sessionInclude,
    });
  });

  const prescriptionsToRecompute = new Set<string>();
  if (existingSession.prescriptionId) {
    prescriptionsToRecompute.add(existingSession.prescriptionId);
  }
  prescriptionsToRecompute.add(nextPrescriptionId);

  await Promise.all(
    Array.from(prescriptionsToRecompute).map((prescriptionToRecomputeId) =>
      recomputePrescriptionCompletedSessions(
        prescriptionToRecomputeId,
        cabinet.cabinetId
      )
    )
  );

  const syncedSession = await prisma.therapySession.findUnique({
    where: { id: session.id },
    include: sessionInclude,
  });

  return jsonSuccess(res, syncedSession || session);
};

const deleteSession = async (
  req: AuthenticatedNextApiRequest,
  res: NextApiResponse
) => {
  const id = getRequiredSessionId(req);
  const entityId = getQueryString(req.query.entityId);

  if (!id) {
    return jsonError(res, 400, "Session id is required");
  }

  if (!entityId) {
    return jsonError(res, 400, "entityId is required");
  }

  const cabinet = await requireHugoCabinet(req);
  if (!cabinet || cabinet.cabinetId !== entityId) {
    return jsonError(res, 403, "Forbidden");
  }

  const existingSession = await prisma.therapySession.findFirst({
    where: { id, entityId },
    select: { id: true, appointmentId: true, prescriptionId: true },
  });

  if (!existingSession) {
    return jsonError(res, 404, "Session not found");
  }

  await prisma.therapySession.delete({ where: { id } });

  if (existingSession.appointmentId) {
    const appointment = await prisma.appointment.findFirst({
      where: {
        id: existingSession.appointmentId,
        entityId,
      },
      select: {
        id: true,
        notes: true,
      },
    });

    if (appointment && !appointment.notes?.includes("Séance supprimée")) {
      await prisma.appointment.update({
        where: { id: appointment.id },
        data: {
          notes: [appointment.notes, "Séance supprimée"]
            .filter(Boolean)
            .join("\n"),
        },
      });
    }
  }

  if (existingSession.prescriptionId) {
    await recomputePrescriptionCompletedSessions(
      existingSession.prescriptionId,
      cabinet.cabinetId
    );
  }

  return jsonSuccess(res, { id });
};

export default withAuth(
  async (req: AuthenticatedNextApiRequest, res: NextApiResponse) => {
    try {
      if (req.method === "GET") {
        return await getSession(req, res);
      }

      if (req.method === "PATCH") {
        return await updateSession(req, res);
      }

      if (req.method === "DELETE") {
        return await deleteSession(req, res);
      }

      return jsonError(res, 405, "Method not allowed");
    } catch (error) {
      console.error("HUGO SESSION ERROR:", error);
      return jsonError(res, 500, "Internal server error");
    }
  }
);
