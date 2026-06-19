import { InvoiceStatus } from "@prisma/client";
import type { NextApiResponse } from "next";
import {
  getOptionalString,
  jsonError,
  jsonSuccess,
} from "../../../../lib/accounting-api";
import { AuthenticatedNextApiRequest, withAuth } from "../../../../lib/auth";
import { requireHugoCabinet } from "../../../../lib/hugo-auth";
import { prisma } from "../../../../lib/prisma";

interface UpdateInvoiceBody {
  patientId?: unknown;
  prescriptionId?: unknown;
  invoiceNumber?: unknown;
  status?: unknown;
  amountCents?: unknown;
  currency?: unknown;
  issuedAt?: unknown;
  dueAt?: unknown;
  paidAt?: unknown;
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

const parseInvoiceStatus = (
  value: unknown
): InvoiceStatus | undefined | null => {
  if (value === undefined) return undefined;

  return typeof value === "string" &&
    Object.values(InvoiceStatus).includes(value as InvoiceStatus)
    ? (value as InvoiceStatus)
    : null;
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

const getNullableString = (value: unknown) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const getRequiredInvoiceId = (req: AuthenticatedNextApiRequest) => {
  return typeof req.query.id === "string" && req.query.id.trim()
    ? req.query.id.trim()
    : null;
};

const validatePatientAndPrescription = async ({
  entityId,
  patientId,
  prescriptionId,
}: {
  entityId: string;
  patientId: string;
  prescriptionId: string;
}) => {
  const [patient, prescription] = await Promise.all([
    prisma.patient.findFirst({
      where: { id: patientId, entityId },
      select: { id: true },
    }),
    prisma.prescription.findFirst({
      where: { id: prescriptionId, entityId },
      select: { id: true, patientId: true },
    }),
  ]);

  if (!patient) {
    return { status: 404, message: "Patient not found" };
  }

  if (!prescription) {
    return { status: 404, message: "Prescription not found" };
  }

  if (prescription.patientId !== patientId) {
    return {
      status: 400,
      message: "Prescription does not belong to the selected patient",
    };
  }

  return null;
};

const getInvoice = async (
  req: AuthenticatedNextApiRequest,
  res: NextApiResponse
) => {
  const id = getRequiredInvoiceId(req);
  const cabinet = await requireHugoCabinet(req);

  if (!id) {
    return jsonError(res, 400, "Invoice id is required");
  }

  if (!cabinet) {
    return jsonError(res, 404, "Cabinet not found");
  }

  const invoice = await prisma.invoice.findFirst({
    where: { id, entityId: cabinet.cabinetId },
    include: invoiceInclude,
  });

  if (!invoice) {
    return jsonError(res, 404, "Invoice not found");
  }

  return jsonSuccess(res, invoice);
};

const updateInvoice = async (
  req: AuthenticatedNextApiRequest,
  res: NextApiResponse
) => {
  const id = getRequiredInvoiceId(req);
  const cabinet = await requireHugoCabinet(req);
  const body = req.body as UpdateInvoiceBody;

  if (!id) {
    return jsonError(res, 400, "Invoice id is required");
  }

  if (!cabinet) {
    return jsonError(res, 404, "Cabinet not found");
  }

  const existingInvoice = await prisma.invoice.findFirst({
    where: { id, entityId: cabinet.cabinetId },
    select: {
      id: true,
      patientId: true,
      prescriptionId: true,
      invoiceNumber: true,
    },
  });

  if (!existingInvoice) {
    return jsonError(res, 404, "Invoice not found");
  }

  const patientId = getOptionalString(body.patientId);
  const prescriptionId = getOptionalString(body.prescriptionId);
  const nextPatientId = patientId || existingInvoice.patientId;
  const nextPrescriptionId = prescriptionId || existingInvoice.prescriptionId;
  const amountCents = parseOptionalNonNegativeInteger(body.amountCents);
  const status = parseInvoiceStatus(body.status);
  const issuedAt = parseNullableDate(body.issuedAt);
  const dueAt = parseNullableDate(body.dueAt);
  const paidAt = parseNullableDate(body.paidAt);
  const invoiceNumber = getNullableString(body.invoiceNumber);
  const currency = getOptionalString(body.currency);

  if (!nextPrescriptionId) {
    return jsonError(res, 400, "prescriptionId is required");
  }

  if (amountCents === null) {
    return jsonError(res, 400, "amountCents must be a non-negative integer");
  }

  if (status === null) {
    return jsonError(res, 400, "A valid invoice status is required");
  }

  if (issuedAt === undefined && body.issuedAt !== undefined) {
    return jsonError(res, 400, "issuedAt must be a valid date");
  }

  if (dueAt === undefined && body.dueAt !== undefined) {
    return jsonError(res, 400, "dueAt must be a valid date");
  }

  if (paidAt === undefined && body.paidAt !== undefined) {
    return jsonError(res, 400, "paidAt must be a valid date");
  }

  const relationValidation = await validatePatientAndPrescription({
    entityId: cabinet.cabinetId,
    patientId: nextPatientId,
    prescriptionId: nextPrescriptionId,
  });

  if (relationValidation) {
    return jsonError(res, relationValidation.status, relationValidation.message);
  }

  if (
    invoiceNumber &&
    invoiceNumber !== existingInvoice.invoiceNumber
  ) {
    const duplicateInvoice = await prisma.invoice.findUnique({
      where: { invoiceNumber },
      select: { id: true },
    });

    if (duplicateInvoice) {
      return jsonError(res, 409, "invoiceNumber already exists");
    }
  }

  const invoice = await prisma.invoice.update({
    where: { id },
    data: {
      ...(patientId ? { patientId: nextPatientId } : {}),
      ...(prescriptionId ? { prescriptionId: nextPrescriptionId } : {}),
      ...(invoiceNumber !== undefined ? { invoiceNumber } : {}),
      ...(status !== undefined ? { status } : {}),
      ...(amountCents !== undefined ? { amountCents } : {}),
      ...(currency ? { currency } : {}),
      ...(issuedAt !== undefined ? { issuedAt } : {}),
      ...(dueAt !== undefined ? { dueAt } : {}),
      ...(paidAt !== undefined ? { paidAt } : {}),
    },
    include: invoiceInclude,
  });

  return jsonSuccess(res, invoice);
};

const deleteInvoice = async (
  req: AuthenticatedNextApiRequest,
  res: NextApiResponse
) => {
  const id = getRequiredInvoiceId(req);
  const cabinet = await requireHugoCabinet(req);

  if (!id) {
    return jsonError(res, 400, "Invoice id is required");
  }

  if (!cabinet) {
    return jsonError(res, 404, "Cabinet not found");
  }

  const existingInvoice = await prisma.invoice.findFirst({
    where: { id, entityId: cabinet.cabinetId },
    select: { id: true },
  });

  if (!existingInvoice) {
    return jsonError(res, 404, "Invoice not found");
  }

  await prisma.invoice.delete({ where: { id } });

  return jsonSuccess(res, { id });
};

export default withAuth(
  async (req: AuthenticatedNextApiRequest, res: NextApiResponse) => {
    try {
      if (req.method === "GET") {
        return await getInvoice(req, res);
      }

      if (req.method === "PATCH") {
        return await updateInvoice(req, res);
      }

      if (req.method === "DELETE") {
        return await deleteInvoice(req, res);
      }

      return jsonError(res, 405, "Method not allowed");
    } catch (error) {
      console.error("HUGO INVOICE ERROR:", error);
      return jsonError(res, 500, "Internal server error");
    }
  }
);
