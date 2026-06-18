import { TherapySessionStatus } from "@prisma/client";
import type { NextApiResponse } from "next";
import {
  getOptionalString,
  getQueryString,
  jsonError,
  jsonSuccess,
} from "../../../../lib/accounting-api";
import { AuthenticatedNextApiRequest, withAuth } from "../../../../lib/auth";
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
      sessionNumber: true,
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

  const session = await prisma.therapySession.update({
    where: { id },
    data: {
      ...(patientId ? { patientId: nextPatientId } : {}),
      ...(prescriptionId ? { prescriptionId: nextPrescriptionId } : {}),
      ...(sessionNumber !== undefined ? { sessionNumber } : {}),
      ...(scheduledAt !== undefined ? { scheduledAt } : {}),
      ...(completedAt !== undefined ? { completedAt } : {}),
      ...(status !== undefined ? { status } : {}),
      ...(getNullableString(body.notes) !== undefined
        ? { notes: getNullableString(body.notes) }
        : {}),
    },
    include: sessionInclude,
  });

  return jsonSuccess(res, session);
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
    select: { id: true },
  });

  if (!existingSession) {
    return jsonError(res, 404, "Session not found");
  }

  await prisma.therapySession.delete({ where: { id } });

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
