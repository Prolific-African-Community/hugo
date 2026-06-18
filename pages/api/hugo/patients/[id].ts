import { PatientStatus } from "@prisma/client";
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

interface UpdatePatientBody {
  entityId?: unknown;
  firstName?: unknown;
  lastName?: unknown;
  email?: unknown;
  phone?: unknown;
  address?: unknown;
  cnsNumber?: unknown;
  status?: unknown;
  notes?: unknown;
}

const parsePatientStatus = (value: unknown): PatientStatus | undefined | null => {
  if (value === undefined) return undefined;

  return typeof value === "string" &&
    Object.values(PatientStatus).includes(value as PatientStatus)
    ? (value as PatientStatus)
    : null;
};

const getNullableString = (value: unknown) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const getRequiredPatientId = (req: AuthenticatedNextApiRequest) => {
  return typeof req.query.id === "string" && req.query.id.trim()
    ? req.query.id.trim()
    : null;
};

const getPatient = async (
  req: AuthenticatedNextApiRequest,
  res: NextApiResponse
) => {
  const id = getRequiredPatientId(req);
  const entityId = getQueryString(req.query.entityId);

  if (!id) {
    return jsonError(res, 400, "Patient id is required");
  }

  if (!entityId) {
    return jsonError(res, 400, "entityId is required");
  }

  const cabinet = await requireHugoCabinet(req);
  if (!cabinet || cabinet.cabinetId !== entityId) {
    return jsonError(res, 403, "Forbidden");
  }

  const patient = await prisma.patient.findFirst({
    where: { id, entityId },
  });

  if (!patient) {
    return jsonError(res, 404, "Patient not found");
  }

  return jsonSuccess(res, patient);
};

const updatePatient = async (
  req: AuthenticatedNextApiRequest,
  res: NextApiResponse
) => {
  const id = getRequiredPatientId(req);
  const body = req.body as UpdatePatientBody;
  const entityId = getOptionalString(body.entityId);
  const status = parsePatientStatus(body.status);

  if (!id) {
    return jsonError(res, 400, "Patient id is required");
  }

  if (!entityId) {
    return jsonError(res, 400, "entityId is required");
  }

  const cabinet = await requireHugoCabinet(req);
  if (!cabinet || cabinet.cabinetId !== entityId) {
    return jsonError(res, 403, "Forbidden");
  }

  if (status === null) {
    return jsonError(res, 400, "A valid patient status is required");
  }

  const existingPatient = await prisma.patient.findFirst({
    where: { id, entityId },
    select: { id: true },
  });

  if (!existingPatient) {
    return jsonError(res, 404, "Patient not found");
  }

  const firstName = getNullableString(body.firstName);
  const lastName = getNullableString(body.lastName);

  if (firstName === null) {
    return jsonError(res, 400, "firstName cannot be empty");
  }

  if (lastName === null) {
    return jsonError(res, 400, "lastName cannot be empty");
  }

  const patient = await prisma.patient.update({
    where: { id },
    data: {
      ...(firstName !== undefined ? { firstName } : {}),
      ...(lastName !== undefined ? { lastName } : {}),
      ...(getNullableString(body.email) !== undefined
        ? { email: getNullableString(body.email) }
        : {}),
      ...(getNullableString(body.phone) !== undefined
        ? { phone: getNullableString(body.phone) }
        : {}),
      ...(getNullableString(body.address) !== undefined
        ? { address: getNullableString(body.address) }
        : {}),
      ...(getNullableString(body.cnsNumber) !== undefined
        ? { cnsNumber: getNullableString(body.cnsNumber) }
        : {}),
      ...(status !== undefined ? { status } : {}),
      ...(getNullableString(body.notes) !== undefined
        ? { notes: getNullableString(body.notes) }
        : {}),
    },
  });

  return jsonSuccess(res, patient);
};

const deletePatient = async (
  req: AuthenticatedNextApiRequest,
  res: NextApiResponse
) => {
  const id = getRequiredPatientId(req);
  const entityId = getQueryString(req.query.entityId);

  if (!id) {
    return jsonError(res, 400, "Patient id is required");
  }

  if (!entityId) {
    return jsonError(res, 400, "entityId is required");
  }

  const cabinet = await requireHugoCabinet(req);
  if (!cabinet || cabinet.cabinetId !== entityId) {
    return jsonError(res, 403, "Forbidden");
  }

  const existingPatient = await prisma.patient.findFirst({
    where: { id, entityId },
    select: { id: true },
  });

  if (!existingPatient) {
    return jsonError(res, 404, "Patient not found");
  }

  await prisma.patient.delete({ where: { id } });

  return jsonSuccess(res, { id });
};

export default withAuth(
  async (req: AuthenticatedNextApiRequest, res: NextApiResponse) => {
    try {
      if (req.method === "GET") {
        return await getPatient(req, res);
      }

      if (req.method === "PATCH") {
        return await updatePatient(req, res);
      }

      if (req.method === "DELETE") {
        return await deletePatient(req, res);
      }

      return jsonError(res, 405, "Method not allowed");
    } catch (error) {
      console.error("HUGO PATIENT ERROR:", error);
      return jsonError(res, 500, "Internal server error");
    }
  }
);
