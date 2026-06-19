import { TherapySessionStatus } from "@prisma/client";
import type { NextApiResponse } from "next";
import {
  getOptionalString,
  jsonError,
  jsonSuccess,
} from "../../../../../lib/accounting-api";
import {
  AuthenticatedNextApiRequest,
  withAuth,
} from "../../../../../lib/auth";
import { requireHugoCabinet } from "../../../../../lib/hugo-auth";
import { prisma } from "../../../../../lib/prisma";

interface CreateSessionFromAppointmentBody {
  prescriptionId?: unknown;
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

const getRequiredAppointmentId = (req: AuthenticatedNextApiRequest) => {
  return typeof req.query.id === "string" && req.query.id.trim()
    ? req.query.id.trim()
    : null;
};

const createSessionFromAppointment = async (
  req: AuthenticatedNextApiRequest,
  res: NextApiResponse
) => {
  const appointmentId = getRequiredAppointmentId(req);
  const cabinet = await requireHugoCabinet(req);
  const body = req.body as CreateSessionFromAppointmentBody;
  const prescriptionId = getOptionalString(body.prescriptionId);

  if (!appointmentId) {
    return jsonError(res, 400, "Appointment id is required");
  }

  if (!cabinet) {
    return jsonError(res, 404, "Cabinet not found");
  }

  if (!prescriptionId) {
    return jsonError(res, 400, "prescriptionId is required");
  }

  const appointment = await prisma.appointment.findFirst({
    where: {
      id: appointmentId,
      entityId: cabinet.cabinetId,
    },
    select: {
      id: true,
      patientId: true,
      startsAt: true,
    },
  });

  if (!appointment) {
    return jsonError(res, 404, "Appointment not found");
  }

  if (!appointment.patientId) {
    return jsonError(res, 400, "Appointment must have a patient");
  }

  const existingSession = await prisma.therapySession.findUnique({
    where: {
      appointmentId: appointment.id,
    },
    include: sessionInclude,
  });

  if (existingSession) {
    return jsonSuccess(res, existingSession);
  }

  const prescription = await prisma.prescription.findFirst({
    where: {
      id: prescriptionId,
      entityId: cabinet.cabinetId,
    },
    select: {
      id: true,
      patientId: true,
      prescribedSessions: true,
    },
  });

  if (!prescription) {
    return jsonError(res, 404, "Prescription not found");
  }

  if (prescription.patientId !== appointment.patientId) {
    return jsonError(
      res,
      400,
      "Prescription does not belong to the appointment patient"
    );
  }

  const lastSession = await prisma.therapySession.findFirst({
    where: {
      entityId: cabinet.cabinetId,
      prescriptionId: prescription.id,
    },
    select: {
      sessionNumber: true,
    },
    orderBy: {
      sessionNumber: "desc",
    },
  });

  const nextSessionNumber = (lastSession?.sessionNumber || 0) + 1;

  if (nextSessionNumber > prescription.prescribedSessions) {
    return jsonError(res, 400, "Prescription has no remaining sessions");
  }

  const session = await prisma.therapySession.create({
    data: {
      entityId: cabinet.cabinetId,
      patientId: appointment.patientId,
      prescriptionId: prescription.id,
      appointmentId: appointment.id,
      sessionNumber: nextSessionNumber,
      scheduledAt: appointment.startsAt,
      status: TherapySessionStatus.PLANNED,
      notes: "Créée depuis rendez-vous",
    },
    include: sessionInclude,
  });

  return jsonSuccess(res, session, 201);
};

export default withAuth(
  async (req: AuthenticatedNextApiRequest, res: NextApiResponse) => {
    try {
      if (req.method === "POST") {
        return await createSessionFromAppointment(req, res);
      }

      return jsonError(res, 405, "Method not allowed");
    } catch (error) {
      console.error("HUGO APPOINTMENT CREATE SESSION ERROR:", error);
      return jsonError(res, 500, "Internal server error");
    }
  }
);
