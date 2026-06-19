import type { NextApiResponse } from "next";
import { jsonError, jsonSuccess } from "../../../../lib/accounting-api";
import { AuthenticatedNextApiRequest, withAuth } from "../../../../lib/auth";
import { requireHugoCabinet } from "../../../../lib/hugo-auth";
import { prisma } from "../../../../lib/prisma";

const getRequiredPatientId = (req: AuthenticatedNextApiRequest) => {
  return typeof req.query.id === "string" && req.query.id.trim()
    ? req.query.id.trim()
    : null;
};

const getPatientSummary = async (
  req: AuthenticatedNextApiRequest,
  res: NextApiResponse
) => {
  const patientId = getRequiredPatientId(req);
  const cabinet = await requireHugoCabinet(req);

  if (!patientId) {
    return jsonError(res, 400, "Patient id is required");
  }

  if (!cabinet) {
    return jsonError(res, 404, "Cabinet not found");
  }

  const patient = await prisma.patient.findFirst({
    where: {
      id: patientId,
      entityId: cabinet.cabinetId,
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      cnsNumber: true,
      status: true,
      notes: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!patient) {
    return jsonError(res, 404, "Patient not found");
  }

  const [prescriptions, sessions, invoices] = await Promise.all([
    prisma.prescription.findMany({
      where: {
        patientId,
        entityId: cabinet.cabinetId,
      },
      select: {
        id: true,
        title: true,
        prescribedSessions: true,
        completedSessions: true,
        status: true,
        startDate: true,
        endDate: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.therapySession.findMany({
      where: {
        patientId,
        entityId: cabinet.cabinetId,
      },
      select: {
        id: true,
        prescriptionId: true,
        sessionNumber: true,
        scheduledAt: true,
        completedAt: true,
        status: true,
        createdAt: true,
        prescription: {
          select: {
            id: true,
            title: true,
          },
        },
      },
      orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }],
    }),
    prisma.invoice.findMany({
      where: {
        patientId,
        entityId: cabinet.cabinetId,
      },
      select: {
        id: true,
        prescriptionId: true,
        invoiceNumber: true,
        status: true,
        amountCents: true,
        currency: true,
        issuedAt: true,
        dueAt: true,
        paidAt: true,
        createdAt: true,
        prescription: {
          select: {
            id: true,
            title: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return jsonSuccess(res, {
    patient,
    prescriptions,
    sessions,
    invoices,
  });
};

export default withAuth(
  async (req: AuthenticatedNextApiRequest, res: NextApiResponse) => {
    try {
      if (req.method === "GET") {
        return await getPatientSummary(req, res);
      }

      return jsonError(res, 405, "Method not allowed");
    } catch (error) {
      console.error("HUGO PATIENT SUMMARY ERROR:", error);
      return jsonError(res, 500, "Internal server error");
    }
  }
);
