import { PrescriptionStatus } from "@prisma/client";
import type { NextApiResponse } from "next";
import {
  getOptionalString,
  getQueryString,
  jsonError,
  jsonSuccess,
} from "../../../../lib/accounting-api";
import { AuthenticatedNextApiRequest, withAuth } from "../../../../lib/auth";
import { getCurrentUserRecord } from "../../../../lib/entity-access";
import { canAccessEntity, canManageEntity } from "../../../../lib/permissions";
import { prisma } from "../../../../lib/prisma";

interface PrescriptionBody {
  entityId?: unknown;
  patientId?: unknown;
  title?: unknown;
  prescribedSessions?: unknown;
  completedSessions?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  status?: unknown;
  notes?: unknown;
}

const patientSelect = {
  id: true,
  firstName: true,
  lastName: true,
};

const parsePrescriptionStatus = (
  value: unknown
): PrescriptionStatus | null => {
  if (value === undefined || value === null || value === "") {
    return PrescriptionStatus.ACTIVE;
  }

  return typeof value === "string" &&
    Object.values(PrescriptionStatus).includes(value as PrescriptionStatus)
    ? (value as PrescriptionStatus)
    : null;
};

const getNullableString = (value: unknown) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
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

const parseOptionalNonNegativeInteger = (value: unknown) => {
  if (value === undefined || value === null || value === "") return 0;

  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
      ? Number(value)
      : NaN;

  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
};

const parseNullableDate = (value: unknown) => {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string") return undefined;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

const listPrescriptions = async (
  req: AuthenticatedNextApiRequest,
  res: NextApiResponse
) => {
  const entityId = getQueryString(req.query.entityId);
  const patientId = getQueryString(req.query.patientId);

  if (!entityId) {
    return jsonError(res, 400, "entityId is required");
  }

  const currentUser = await getCurrentUserRecord(req.user.id);
  if (!currentUser || !(await canAccessEntity(currentUser, entityId))) {
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

  const prescriptions = await prisma.prescription.findMany({
    where: {
      entityId,
      ...(patientId ? { patientId } : {}),
    },
    include: {
      patient: {
        select: patientSelect,
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  return jsonSuccess(res, prescriptions);
};

const createPrescription = async (
  req: AuthenticatedNextApiRequest,
  res: NextApiResponse
) => {
  const body = req.body as PrescriptionBody;
  const entityId = getOptionalString(body.entityId);
  const patientId = getOptionalString(body.patientId);
  const title = getOptionalString(body.title);
  const prescribedSessions = parseRequiredPositiveInteger(body.prescribedSessions);
  const completedSessions = parseOptionalNonNegativeInteger(body.completedSessions);
  const status = parsePrescriptionStatus(body.status);
  const startDate = parseNullableDate(body.startDate);
  const endDate = parseNullableDate(body.endDate);

  if (!entityId) {
    return jsonError(res, 400, "entityId is required");
  }

  const currentUser = await getCurrentUserRecord(req.user.id);
  if (!currentUser || !(await canManageEntity(currentUser, entityId))) {
    return jsonError(res, 403, "Forbidden");
  }

  if (!patientId) {
    return jsonError(res, 400, "patientId is required");
  }

  if (!title) {
    return jsonError(res, 400, "title is required");
  }

  if (!prescribedSessions) {
    return jsonError(
      res,
      400,
      "prescribedSessions must be an integer greater than 0"
    );
  }

  if (completedSessions === null) {
    return jsonError(
      res,
      400,
      "completedSessions must be a non-negative integer"
    );
  }

  if (completedSessions > prescribedSessions) {
    return jsonError(
      res,
      400,
      "completedSessions cannot exceed prescribedSessions"
    );
  }

  if (!status) {
    return jsonError(res, 400, "A valid prescription status is required");
  }

  if (startDate === undefined && body.startDate !== undefined) {
    return jsonError(res, 400, "startDate must be a valid date");
  }

  if (endDate === undefined && body.endDate !== undefined) {
    return jsonError(res, 400, "endDate must be a valid date");
  }

  const patient = await prisma.patient.findFirst({
    where: { id: patientId, entityId },
    select: { id: true },
  });

  if (!patient) {
    return jsonError(res, 404, "Patient not found");
  }

  const prescription = await prisma.prescription.create({
    data: {
      entityId,
      patientId,
      title,
      prescribedSessions,
      completedSessions,
      startDate,
      endDate,
      status,
      notes: getNullableString(body.notes),
    },
    include: {
      patient: {
        select: patientSelect,
      },
    },
  });

  return jsonSuccess(res, prescription, 201);
};

export default withAuth(
  async (req: AuthenticatedNextApiRequest, res: NextApiResponse) => {
    try {
      if (req.method === "GET") {
        return await listPrescriptions(req, res);
      }

      if (req.method === "POST") {
        return await createPrescription(req, res);
      }

      return jsonError(res, 405, "Method not allowed");
    } catch (error) {
      console.error("HUGO PRESCRIPTIONS ERROR:", error);
      return jsonError(res, 500, "Internal server error");
    }
  }
);
