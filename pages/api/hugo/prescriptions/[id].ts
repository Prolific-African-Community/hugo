import { PrescriptionStatus } from "@prisma/client";
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

interface UpdatePrescriptionBody {
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
): PrescriptionStatus | undefined | null => {
  if (value === undefined) return undefined;

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

const parseOptionalNonNegativeInteger = (value: unknown) => {
  if (value === undefined) return undefined;

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

const getRequiredPrescriptionId = (req: AuthenticatedNextApiRequest) => {
  return typeof req.query.id === "string" && req.query.id.trim()
    ? req.query.id.trim()
    : null;
};

const getPrescription = async (
  req: AuthenticatedNextApiRequest,
  res: NextApiResponse
) => {
  const id = getRequiredPrescriptionId(req);
  const entityId = getQueryString(req.query.entityId);

  if (!id) {
    return jsonError(res, 400, "Prescription id is required");
  }

  if (!entityId) {
    return jsonError(res, 400, "entityId is required");
  }

  const cabinet = await requireHugoCabinet(req);
  if (!cabinet || cabinet.cabinetId !== entityId) {
    return jsonError(res, 403, "Forbidden");
  }

  const prescription = await prisma.prescription.findFirst({
    where: { id, entityId },
    include: {
      patient: {
        select: patientSelect,
      },
    },
  });

  if (!prescription) {
    return jsonError(res, 404, "Prescription not found");
  }

  return jsonSuccess(res, prescription);
};

const updatePrescription = async (
  req: AuthenticatedNextApiRequest,
  res: NextApiResponse
) => {
  const id = getRequiredPrescriptionId(req);
  const body = req.body as UpdatePrescriptionBody;
  const entityId = getOptionalString(body.entityId);
  const patientId = getOptionalString(body.patientId);
  const title = getNullableString(body.title);
  const prescribedSessions = parseOptionalPositiveInteger(body.prescribedSessions);
  const completedSessions = parseOptionalNonNegativeInteger(body.completedSessions);
  const status = parsePrescriptionStatus(body.status);
  const startDate = parseNullableDate(body.startDate);
  const endDate = parseNullableDate(body.endDate);

  if (!id) {
    return jsonError(res, 400, "Prescription id is required");
  }

  if (!entityId) {
    return jsonError(res, 400, "entityId is required");
  }

  const cabinet = await requireHugoCabinet(req);
  if (!cabinet || cabinet.cabinetId !== entityId) {
    return jsonError(res, 403, "Forbidden");
  }

  if (title === null) {
    return jsonError(res, 400, "title cannot be empty");
  }

  if (prescribedSessions === null) {
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

  if (status === null) {
    return jsonError(res, 400, "A valid prescription status is required");
  }

  if (startDate === undefined && body.startDate !== undefined) {
    return jsonError(res, 400, "startDate must be a valid date");
  }

  if (endDate === undefined && body.endDate !== undefined) {
    return jsonError(res, 400, "endDate must be a valid date");
  }

  const existingPrescription = await prisma.prescription.findFirst({
    where: { id, entityId },
    select: {
      id: true,
      prescribedSessions: true,
      completedSessions: true,
    },
  });

  if (!existingPrescription) {
    return jsonError(res, 404, "Prescription not found");
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

  const nextPrescribedSessions =
    prescribedSessions ?? existingPrescription.prescribedSessions;
  const nextCompletedSessions =
    completedSessions ?? existingPrescription.completedSessions;

  if (nextCompletedSessions > nextPrescribedSessions) {
    return jsonError(
      res,
      400,
      "completedSessions cannot exceed prescribedSessions"
    );
  }

  const prescription = await prisma.prescription.update({
    where: { id },
    data: {
      ...(patientId ? { patientId } : {}),
      ...(title !== undefined ? { title } : {}),
      ...(prescribedSessions !== undefined ? { prescribedSessions } : {}),
      ...(completedSessions !== undefined ? { completedSessions } : {}),
      ...(startDate !== undefined ? { startDate } : {}),
      ...(endDate !== undefined ? { endDate } : {}),
      ...(status !== undefined ? { status } : {}),
      ...(getNullableString(body.notes) !== undefined
        ? { notes: getNullableString(body.notes) }
        : {}),
    },
    include: {
      patient: {
        select: patientSelect,
      },
    },
  });

  return jsonSuccess(res, prescription);
};

const deletePrescription = async (
  req: AuthenticatedNextApiRequest,
  res: NextApiResponse
) => {
  const id = getRequiredPrescriptionId(req);
  const entityId = getQueryString(req.query.entityId);

  if (!id) {
    return jsonError(res, 400, "Prescription id is required");
  }

  if (!entityId) {
    return jsonError(res, 400, "entityId is required");
  }

  const cabinet = await requireHugoCabinet(req);
  if (!cabinet || cabinet.cabinetId !== entityId) {
    return jsonError(res, 403, "Forbidden");
  }

  const existingPrescription = await prisma.prescription.findFirst({
    where: { id, entityId },
    select: { id: true },
  });

  if (!existingPrescription) {
    return jsonError(res, 404, "Prescription not found");
  }

  await prisma.prescription.delete({ where: { id } });

  return jsonSuccess(res, { id });
};

export default withAuth(
  async (req: AuthenticatedNextApiRequest, res: NextApiResponse) => {
    try {
      if (req.method === "GET") {
        return await getPrescription(req, res);
      }

      if (req.method === "PATCH") {
        return await updatePrescription(req, res);
      }

      if (req.method === "DELETE") {
        return await deletePrescription(req, res);
      }

      return jsonError(res, 405, "Method not allowed");
    } catch (error) {
      console.error("HUGO PRESCRIPTION ERROR:", error);
      return jsonError(res, 500, "Internal server error");
    }
  }
);
