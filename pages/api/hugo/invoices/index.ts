import { InvoiceStatus } from "@prisma/client";
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

interface InvoiceBody {
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

const parseInvoiceStatus = (value: unknown): InvoiceStatus | null => {
  if (value === undefined || value === null || value === "") {
    return InvoiceStatus.DRAFT;
  }

  return typeof value === "string" &&
    Object.values(InvoiceStatus).includes(value as InvoiceStatus)
    ? (value as InvoiceStatus)
    : null;
};

const parseRequiredNonNegativeInteger = (value: unknown) => {
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

const listInvoices = async (
  req: AuthenticatedNextApiRequest,
  res: NextApiResponse
) => {
  const cabinet = await requireHugoCabinet(req);

  if (!cabinet) {
    return jsonError(res, 404, "Cabinet not found");
  }

  const patientId = getQueryString(req.query.patientId);
  const prescriptionId = getQueryString(req.query.prescriptionId);
  const entityId = cabinet.cabinetId;

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

  const invoices = await prisma.invoice.findMany({
    where: {
      entityId,
      ...(patientId ? { patientId } : {}),
      ...(prescriptionId ? { prescriptionId } : {}),
    },
    include: invoiceInclude,
    orderBy: { updatedAt: "desc" },
  });

  return jsonSuccess(res, invoices);
};

const createInvoice = async (
  req: AuthenticatedNextApiRequest,
  res: NextApiResponse
) => {
  const cabinet = await requireHugoCabinet(req);

  if (!cabinet) {
    return jsonError(res, 404, "Cabinet not found");
  }

  const body = req.body as InvoiceBody;
  const entityId = cabinet.cabinetId;
  const patientId = getOptionalString(body.patientId);
  const prescriptionId = getOptionalString(body.prescriptionId);
  const amountCents = parseRequiredNonNegativeInteger(body.amountCents);
  const status = parseInvoiceStatus(body.status);
  const currency = getOptionalString(body.currency) || "EUR";
  const issuedAt = parseNullableDate(body.issuedAt);
  const dueAt = parseNullableDate(body.dueAt);
  const paidAt = parseNullableDate(body.paidAt);

  if (!patientId) {
    return jsonError(res, 400, "patientId is required");
  }

  if (!prescriptionId) {
    return jsonError(res, 400, "prescriptionId is required");
  }

  if (amountCents === null) {
    return jsonError(res, 400, "amountCents must be a non-negative integer");
  }

  if (!status) {
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
    entityId,
    patientId,
    prescriptionId,
  });

  if (relationValidation) {
    return jsonError(res, relationValidation.status, relationValidation.message);
  }

  const invoiceNumber = getNullableString(body.invoiceNumber);

  if (invoiceNumber) {
    const duplicateInvoice = await prisma.invoice.findUnique({
      where: { invoiceNumber },
      select: { id: true },
    });

    if (duplicateInvoice) {
      return jsonError(res, 409, "invoiceNumber already exists");
    }
  }

  const invoice = await prisma.invoice.create({
    data: {
      entityId,
      patientId,
      prescriptionId,
      invoiceNumber,
      status,
      amountCents,
      currency,
      issuedAt,
      dueAt,
      paidAt,
    },
    include: invoiceInclude,
  });

  return jsonSuccess(res, invoice, 201);
};

export default withAuth(
  async (req: AuthenticatedNextApiRequest, res: NextApiResponse) => {
    try {
      if (req.method === "GET") {
        return await listInvoices(req, res);
      }

      if (req.method === "POST") {
        return await createInvoice(req, res);
      }

      return jsonError(res, 405, "Method not allowed");
    } catch (error) {
      console.error("HUGO INVOICES ERROR:", error);
      return jsonError(res, 500, "Internal server error");
    }
  }
);
