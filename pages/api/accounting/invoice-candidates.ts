import { Prisma } from "@prisma/client";
import type { NextApiResponse } from "next";
import {
  getOptionalString,
  getQueryString,
  jsonError,
  jsonSuccess,
  parseAmount,
  parseDate,
} from "../../../lib/accounting-api";
import { createAuditLog } from "../../../lib/audit-log";
import { AuthenticatedNextApiRequest, withAuth } from "../../../lib/auth";
import { getCurrentUserRecord } from "../../../lib/entity-access";
import { canAccessEntity, canManageDocuments } from "../../../lib/permissions";
import { prisma } from "../../../lib/prisma";

interface CreateInvoiceCandidateBody {
  entityId?: unknown;
  documentId?: unknown;
  counterpartyId?: unknown;
  type?: unknown;
  invoiceNumber?: unknown;
  invoiceDate?: unknown;
  dueDate?: unknown;
  currency?: unknown;
  subtotal?: unknown;
  vatAmount?: unknown;
  totalAmount?: unknown;
  description?: unknown;
}

const INVOICE_DOCUMENT_TYPES = new Set([
  "INVOICE",
  "SUPPLIER_INVOICE",
  "CUSTOMER_INVOICE",
]);
const INVOICE_CANDIDATE_TYPES = new Set(["SUPPLIER", "CUSTOMER"]);

const serializeInvoiceCandidate = <
  T extends {
    subtotal: Prisma.Decimal | null;
    vatAmount: Prisma.Decimal | null;
    totalAmount: Prisma.Decimal;
    document?: {
      id: string;
      title: string | null;
      originalFilename: string | null;
      type: string;
      status: string;
      transaction?: {
        id: string;
        date: Date;
        type: string;
        amount: Prisma.Decimal;
        currency: string;
        status: string;
        description: string | null;
      } | null;
    } | null;
    counterparty?: {
      id: string;
      name: string;
      type: string;
    } | null;
  },
>(
  candidate: T
) => ({
  ...candidate,
  subtotal: candidate.subtotal?.toFixed(2) ?? null,
  vatAmount: candidate.vatAmount?.toFixed(2) ?? null,
  totalAmount: candidate.totalAmount.toFixed(2),
});

const listInvoiceCandidates = async (
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

  const candidates = await prisma.invoiceCandidate.findMany({
    where: { entityId },
    orderBy: [{ invoiceDate: "desc" }, { createdAt: "desc" }],
    include: {
      document: {
        select: {
          id: true,
          title: true,
          originalFilename: true,
          type: true,
          status: true,
          transaction: {
            select: {
              id: true,
              date: true,
              type: true,
              amount: true,
              currency: true,
              status: true,
              description: true,
            },
          },
        },
      },
      counterparty: {
        select: {
          id: true,
          name: true,
          type: true,
        },
      },
    },
  });

  return jsonSuccess(res, candidates.map(serializeInvoiceCandidate));
};

const createInvoiceCandidate = async (
  req: AuthenticatedNextApiRequest,
  res: NextApiResponse
) => {
  const body = req.body as CreateInvoiceCandidateBody;
  const entityId = getOptionalString(body.entityId);
  const documentId = getOptionalString(body.documentId);
  const counterpartyId = getOptionalString(body.counterpartyId);
  const invoiceType = getOptionalString(body.type)?.toUpperCase();
  const invoiceNumber = getOptionalString(body.invoiceNumber);
  const invoiceDate = parseDate(body.invoiceDate);
  const dueDate = body.dueDate ? parseDate(body.dueDate) : null;
  const currency = (getOptionalString(body.currency) || "EUR").toUpperCase();
  const subtotal = body.subtotal === "" || body.subtotal === undefined ? null : parseAmount(body.subtotal);
  const vatAmount = body.vatAmount === "" || body.vatAmount === undefined ? null : parseAmount(body.vatAmount);
  const totalAmount = parseAmount(body.totalAmount);
  const description = getOptionalString(body.description);

  if (!entityId) {
    return jsonError(res, 400, "entityId is required");
  }

  if (!documentId) {
    return jsonError(res, 400, "documentId is required");
  }

  const currentUser = await getCurrentUserRecord(req.user.id);

  if (!currentUser || !(await canManageDocuments(currentUser, entityId))) {
    return jsonError(res, 403, "Forbidden");
  }

  if (!invoiceType || !INVOICE_CANDIDATE_TYPES.has(invoiceType)) {
    return jsonError(res, 400, "A valid invoice candidate type is required");
  }

  if (!invoiceDate) {
    return jsonError(res, 400, "invoiceDate is required");
  }

  if (body.dueDate && !dueDate) {
    return jsonError(res, 400, "dueDate must be a valid ISO date string");
  }

  if (body.subtotal !== "" && body.subtotal !== undefined && !subtotal) {
    return jsonError(res, 400, "subtotal must be greater than 0");
  }

  if (body.vatAmount !== "" && body.vatAmount !== undefined && !vatAmount) {
    return jsonError(res, 400, "vatAmount must be greater than 0");
  }

  if (!totalAmount) {
    return jsonError(res, 400, "totalAmount must be greater than 0");
  }

  const [entity, document, counterparty, existingCandidate] = await Promise.all([
    prisma.entity.findUnique({
      where: { id: entityId },
      select: {
        id: true,
        organizationId: true,
        baseCurrency: true,
      },
    }),
    prisma.document.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        entityId: true,
        type: true,
        status: true,
        title: true,
        originalFilename: true,
        counterpartyId: true,
      },
    }),
    counterpartyId
      ? prisma.counterparty.findUnique({
          where: { id: counterpartyId },
          select: {
            id: true,
            entityId: true,
            name: true,
            type: true,
          },
        })
      : Promise.resolve(null),
    prisma.invoiceCandidate.findUnique({
      where: { documentId },
      select: { id: true },
    }),
  ]);

  if (!entity) {
    return jsonError(res, 404, "Entity not found");
  }

  if (!document) {
    return jsonError(res, 404, "Document not found");
  }

  if (document.entityId !== entityId) {
    return jsonError(res, 400, "Document does not belong to the selected entity");
  }

  if (!INVOICE_DOCUMENT_TYPES.has(document.type)) {
    return jsonError(res, 400, "Only invoice documents can become invoice candidates");
  }

  if (document.status !== "REVIEWED") {
    return jsonError(res, 400, "Document must be reviewed before creating an invoice candidate");
  }

  if (existingCandidate) {
    return jsonError(res, 409, "An invoice candidate already exists for this document");
  }

  if (counterpartyId && !counterparty) {
    return jsonError(res, 404, "Counterparty not found");
  }

  if (counterparty && counterparty.entityId !== entityId) {
    return jsonError(res, 400, "Counterparty does not belong to the selected entity");
  }

  const candidate = await prisma.$transaction(async (tx) => {
    const created = await tx.invoiceCandidate.create({
      data: {
        entityId,
        documentId,
        counterpartyId: counterpartyId || document.counterpartyId || undefined,
        type: invoiceType,
        status: "DRAFT",
        invoiceNumber,
        invoiceDate,
        dueDate: dueDate || undefined,
        currency: currency || entity.baseCurrency || "EUR",
        subtotal: subtotal || undefined,
        vatAmount: vatAmount || undefined,
        totalAmount,
        description,
      },
      include: {
        document: {
          select: {
            id: true,
            title: true,
            originalFilename: true,
            type: true,
            status: true,
            transaction: {
              select: {
                id: true,
                date: true,
                type: true,
                amount: true,
                currency: true,
                status: true,
                description: true,
              },
            },
          },
        },
        counterparty: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
    });

    await createAuditLog(tx, {
      userId: req.user.id,
      organizationId: entity.organizationId,
      entityId,
      action: "INVOICE_CANDIDATE_CREATED",
      resourceType: "InvoiceCandidate",
      resourceId: created.id,
      metadata: {
        documentId,
        documentType: document.type,
        counterpartyId: created.counterpartyId,
        type: created.type,
        status: created.status,
        invoiceNumber: created.invoiceNumber,
        invoiceDate: created.invoiceDate,
        totalAmount: created.totalAmount.toFixed(2),
        currency: created.currency,
      },
    });

    return created;
  });

  return jsonSuccess(res, serializeInvoiceCandidate(candidate), 201);
};

export default withAuth(async (req: AuthenticatedNextApiRequest, res: NextApiResponse) => {
  try {
    if (req.method === "GET") {
      await listInvoiceCandidates(req, res);
      return;
    }

    if (req.method === "POST") {
      await createInvoiceCandidate(req, res);
      return;
    }

    jsonError(res, 405, "Method not allowed");
  } catch (error) {
    console.error("ACCOUNTING INVOICE CANDIDATES ERROR:", error);
    jsonError(res, 500, "Internal server error");
  }
});
