import { PatientStatus } from "@prisma/client";
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

interface PatientBody {
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

const parsePatientStatus = (value: unknown): PatientStatus | null => {
  if (value === undefined || value === null || value === "") {
    return PatientStatus.ACTIVE;
  }

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

const listPatients = async (
  req: AuthenticatedNextApiRequest,
  res: NextApiResponse
) => {
  const entityId = getQueryString(req.query.entityId);

  if (!entityId) {
    return jsonError(res, 400, "entityId is required");
  }

  const currentUser = await getCurrentUserRecord(req.user.id);
  if (!currentUser || !(await canAccessEntity(currentUser, entityId))) {
    return jsonError(res, 403, "Forbidden");
  }

  const patients = await prisma.patient.findMany({
    where: { entityId },
    orderBy: { updatedAt: "desc" },
  });

  return jsonSuccess(res, patients);
};

const createPatient = async (
  req: AuthenticatedNextApiRequest,
  res: NextApiResponse
) => {
  const body = req.body as PatientBody;
  const entityId = getOptionalString(body.entityId);
  const firstName = getOptionalString(body.firstName);
  const lastName = getOptionalString(body.lastName);
  const status = parsePatientStatus(body.status);

  if (!entityId) {
    return jsonError(res, 400, "entityId is required");
  }

  const currentUser = await getCurrentUserRecord(req.user.id);
  if (!currentUser || !(await canManageEntity(currentUser, entityId))) {
    return jsonError(res, 403, "Forbidden");
  }

  if (!firstName) {
    return jsonError(res, 400, "firstName is required");
  }

  if (!lastName) {
    return jsonError(res, 400, "lastName is required");
  }

  if (!status) {
    return jsonError(res, 400, "A valid patient status is required");
  }

  const entity = await prisma.entity.findUnique({
    where: { id: entityId },
    select: { id: true },
  });

  if (!entity) {
    return jsonError(res, 404, "Entity not found");
  }

  const patient = await prisma.patient.create({
    data: {
      entityId,
      firstName,
      lastName,
      email: getNullableString(body.email),
      phone: getNullableString(body.phone),
      address: getNullableString(body.address),
      cnsNumber: getNullableString(body.cnsNumber),
      status,
      notes: getNullableString(body.notes),
    },
  });

  return jsonSuccess(res, patient, 201);
};

export default withAuth(
  async (req: AuthenticatedNextApiRequest, res: NextApiResponse) => {
    try {
      if (req.method === "GET") {
        return await listPatients(req, res);
      }

      if (req.method === "POST") {
        return await createPatient(req, res);
      }

      return jsonError(res, 405, "Method not allowed");
    } catch (error) {
      console.error("HUGO PATIENTS ERROR:", error);
      return jsonError(res, 500, "Internal server error");
    }
  }
);
