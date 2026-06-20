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

interface SessionBody {
  entityId?: unknown;
  patientId?: unknown;
  prescriptionId?: unknown;
  appointmentId?: unknown;
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

const parseSessionStatus = (value: unknown): TherapySessionStatus | null => {
  if (value === undefined || value === null || value === "") {
    return TherapySessionStatus.PLANNED;
  }

  return typeof value === "string" &&
    Object.values(TherapySessionStatus).includes(value as TherapySessionStatus)
    ? (value as TherapySessionStatus)
    : null;
};

const parseRequiredPositiveInteger = (value: unknown) => {
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

const listSessions = async (
  req: AuthenticatedNextApiRequest,
  res: NextApiResponse
) => {
  const entityId = getQueryString(req.query.entityId);
  const patientId = getQueryString(req.query.patientId);
  const prescriptionId = getQueryString(req.query.prescriptionId);

  if (!entityId) {
    return jsonError(res, 400, "entityId is required");
  }

  const cabinet = await requireHugoCabinet(req);
  if (!cabinet || cabinet.cabinetId !== entityId) {
    return jsonError(res, 403, "Forbidden");
  }

  if (patientId) {
    const patient = await prisma.patient.findFirst({
      where: { id: patientId, entityId },
      select: { id: true },
    });

    if (!patient) {
      return jsonError(res, 404, "Patient not found");
    }
  }

  if (prescriptionId) {
    const prescription = await prisma.prescription.findFirst({
      where: { id: prescriptionId, entityId },
      select: { id: true, patientId: true },
    });

    if (!prescription) {
      return jsonError(res, 404, "Prescription not found");
    }

    if (patientId && prescription.patientId !== patientId) {
      return jsonError(
        res,
        400,
        "Prescription does not belong to the selected patient"
      );
    }
  }

  const sessions = await prisma.therapySession.findMany({
    where: {
      entityId,
      ...(patientId ? { patientId } : {}),
      ...(prescriptionId ? { prescriptionId } : {}),
    },
    include: sessionInclude,
    orderBy: { scheduledAt: "desc" },
  });

  return jsonSuccess(res, sessions);
};

const createSession = async (
  req: AuthenticatedNextApiRequest,
  res: NextApiResponse
) => {
  const body = req.body as SessionBody;
  const entityId = getOptionalString(body.entityId);
  const patientId = getOptionalString(body.patientId);
  const prescriptionId = getOptionalString(body.prescriptionId);
  const appointmentId = getOptionalString(body.appointmentId);
  const sessionNumber = parseRequiredPositiveInteger(body.sessionNumber);
  const scheduledAt = parseNullableDate(body.scheduledAt);
  const completedAt = parseNullableDate(body.completedAt);
  const status = parseSessionStatus(body.status);

  if (!entityId) {
    return jsonError(res, 400, "entityId is required");
  }

  const cabinet = await requireHugoCabinet(req);
  if (!cabinet || cabinet.cabinetId !== entityId) {
    return jsonError(res, 403, "Forbidden");
  }

  if (!patientId) {
    return jsonError(res, 400, "patientId is required");
  }

  if (!prescriptionId) {
    return jsonError(res, 400, "prescriptionId is required");
  }

  if (!sessionNumber) {
    return jsonError(
      res,
      400,
      "sessionNumber must be an integer greater than 0"
    );
  }

  if (!status) {
    return jsonError(res, 400, "A valid therapy session status is required");
  }

  if (scheduledAt === undefined && body.scheduledAt !== undefined) {
    return jsonError(res, 400, "scheduledAt must be a valid date");
  }

  if (completedAt === undefined && body.completedAt !== undefined) {
    return jsonError(res, 400, "completedAt must be a valid date");
  }

  const patient = await prisma.patient.findFirst({
    where: { id: patientId, entityId },
    select: { id: true },
  });

  if (!patient) {
    return jsonError(res, 404, "Patient not found");
  }

  const prescription = await prisma.prescription.findFirst({
    where: { id: prescriptionId, entityId },
    select: { id: true, patientId: true, prescribedSessions: true },
  });

  if (!prescription) {
    return jsonError(res, 404, "Prescription not found");
  }

  if (prescription.patientId !== patientId) {
    return jsonError(
      res,
      400,
      "Prescription does not belong to the selected patient"
    );
  }

  if (sessionNumber > prescription.prescribedSessions) {
    return jsonError(res, 400, "sessionNumber cannot exceed prescribedSessions");
  }

  const duplicateSession = await prisma.therapySession.findFirst({
    where: { entityId, prescriptionId, sessionNumber },
    select: { id: true },
  });

  if (duplicateSession) {
    return jsonError(
      res,
      409,
      "A session with this number already exists for this prescription"
    );
  }

  let linkedAppointmentId = appointmentId || null;

  if (appointmentId) {
    const appointment = await prisma.appointment.findFirst({
      where: {
        id: appointmentId,
        entityId,
        patientId,
      },
      select: { id: true },
    });

    if (!appointment) {
      return jsonError(res, 404, "Appointment not found");
    }

    const existingLinkedSession = await prisma.therapySession.findUnique({
      where: { appointmentId },
      select: { id: true },
    });

    if (existingLinkedSession) {
      return jsonError(res, 409, "Appointment already has a session");
    }
  }

  if (scheduledAt && !appointmentId) {
    const appointmentEndsAt = getDefaultAppointmentEnd(scheduledAt);
    const overlap = await findAppointmentOverlap({
      cabinetId: entityId,
      startsAt: scheduledAt,
      endsAt: appointmentEndsAt,
    });

    if (overlap) {
      return jsonError(res, 409, APPOINTMENT_OVERLAP_MESSAGE);
    }
  }

  const session = await prisma.$transaction(async (tx) => {
    const createdAppointment =
      scheduledAt && !appointmentId
        ? await tx.appointment.create({
            data: {
              entityId,
              patientId,
              startsAt: scheduledAt,
              endsAt: getDefaultAppointmentEnd(scheduledAt),
              status: AppointmentStatus.SCHEDULED,
              source: AppointmentSource.MANUAL,
              notes: "Créé depuis séance",
            },
            select: { id: true },
          })
        : null;

    linkedAppointmentId = appointmentId || createdAppointment?.id || null;

    return tx.therapySession.create({
      data: {
        entityId,
        patientId,
        prescriptionId,
        appointmentId: linkedAppointmentId,
        sessionNumber,
        scheduledAt,
        completedAt,
        status,
        notes: getNullableString(body.notes),
      },
      include: sessionInclude,
    });
  });

  await recomputePrescriptionCompletedSessions(
    prescriptionId,
    cabinet.cabinetId
  );

  const syncedSession = await prisma.therapySession.findUnique({
    where: { id: session.id },
    include: sessionInclude,
  });

  return jsonSuccess(res, syncedSession || session, 201);
};

export default withAuth(
  async (req: AuthenticatedNextApiRequest, res: NextApiResponse) => {
    try {
      if (req.method === "GET") {
        return await listSessions(req, res);
      }

      if (req.method === "POST") {
        return await createSession(req, res);
      }

      return jsonError(res, 405, "Method not allowed");
    } catch (error) {
      console.error("HUGO SESSIONS ERROR:", error);
      return jsonError(res, 500, "Internal server error");
    }
  }
);
