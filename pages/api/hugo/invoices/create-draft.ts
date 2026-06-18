import { InvoiceStatus } from "@prisma/client";
import type { NextApiResponse } from "next";
import { getOptionalString, jsonError, jsonSuccess } from "../../../../lib/accounting-api";
import { AuthenticatedNextApiRequest, withAuth } from "../../../../lib/auth";
import { requireHugoCabinet } from "../../../../lib/hugo-auth";
import { prisma } from "../../../../lib/prisma";

interface CreateDraftBody {
  prescriptionId?: unknown;
}

const invoiceInclude = {
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
    },
  },
};

const createDraftInvoice = async (
  req: AuthenticatedNextApiRequest,
  res: NextApiResponse
) => {
  const cabinet = await requireHugoCabinet(req);

  if (!cabinet) {
    return jsonError(res, 404, "Cabinet not found");
  }

  const body = req.body as CreateDraftBody;
  const prescriptionId = getOptionalString(body.prescriptionId);

  if (!prescriptionId) {
    return jsonError(res, 400, "prescriptionId is required");
  }

  const prescription = await prisma.prescription.findFirst({
    where: {
      id: prescriptionId,
      entityId: cabinet.cabinetId,
    },
    select: {
      id: true,
      patientId: true,
      patient: {
        select: {
          id: true,
        },
      },
    },
  });

  if (!prescription) {
    return jsonError(res, 404, "Prescription not found");
  }

  const activeInvoice = await prisma.invoice.findFirst({
    where: {
      entityId: cabinet.cabinetId,
      prescriptionId: prescription.id,
      status: {
        not: InvoiceStatus.CANCELLED,
      },
    },
    select: { id: true },
  });

  if (activeInvoice) {
    return jsonError(
      res,
      409,
      "An active invoice already exists for this prescription"
    );
  }

  const invoice = await prisma.invoice.create({
    data: {
      entityId: cabinet.cabinetId,
      patientId: prescription.patientId,
      prescriptionId: prescription.id,
      invoiceNumber: null,
      status: InvoiceStatus.DRAFT,
      amountCents: 0,
      currency: "EUR",
    },
    include: invoiceInclude,
  });

  return jsonSuccess(res, invoice, 201);
};

export default withAuth(
  async (req: AuthenticatedNextApiRequest, res: NextApiResponse) => {
    try {
      if (req.method === "POST") {
        return await createDraftInvoice(req, res);
      }

      return jsonError(res, 405, "Method not allowed");
    } catch (error) {
      console.error("HUGO CREATE DRAFT INVOICE ERROR:", error);
      return jsonError(res, 500, "Internal server error");
    }
  }
);
