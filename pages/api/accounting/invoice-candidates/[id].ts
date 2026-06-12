import { Prisma } from "@prisma/client";
import type { NextApiResponse } from "next";
import {
  getOptionalString,
  jsonError,
  jsonSuccess,
  parseAmount,
} from "../../../../lib/accounting-api";
import { createAuditLog } from "../../../../lib/audit-log";
import { AuthenticatedNextApiRequest, withAuth } from "../../../../lib/auth";
import { getCurrentUserRecord } from "../../../../lib/entity-access";
import { canManageDocuments } from "../../../../lib/permissions";
import { prisma } from "../../../../lib/prisma";

interface UpdateInvoiceCandidateBody {
  counterpartyId?: unknown;
  type?: unknown;
  status?: unknown;
  invoiceNumber?: unknown;
  invoiceDate?: unknown;
  dueDate?: unknown;
  currency?: unknown;
  subtotal?: unknown;
  vatAmount?: unknown;
  totalAmount?: unknown;
  description?: unknown;
}

const INVOICE_CANDIDATE_TYPES = new Set(["SUPPLIER", "CUSTOMER"]);
const INVOICE_CANDIDATE_STATUSES = new Set([
  "DRAFT",
  "READY_FOR_ACCOUNTING_REVIEW",
  "ACCOUNTING_DRAFT_CREATED",
]);

const serializeInvoiceCandidate = <
  T extends {
    subtotal: Prisma.Decimal | null;
    vatAmount: Prisma.Decimal | null;
    totalAmount: Prisma.Decimal;
  },
>(
  candidate: T
) => ({
  ...candidate,
  subtotal: candidate.subtotal?.toFixed(2) ?? null,
  vatAmount: candidate.vatAmount?.toFixed(2) ?? null,
  totalAmount: candidate.totalAmount.toFixed(2),
});

const parseOptionalDateValue = (value: unknown) => {
  if (value === undefined) {
    return { provided: false, value: undefined as Date | undefined };
  }

  if (value === null || value === "") {
    return { provided: true, value: null as Date | null };
  }

  if (typeof value !== "string") {
    return { provided: true, value: "invalid" as const };
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return { provided: true, value: "invalid" as const };
  }

  return { provided: true, value: date };
};

const getCandidateReadinessGaps = (candidate: {
  counterpartyId: string | null;
  invoiceDate: Date | null;
  currency: string;
  totalAmount: Prisma.Decimal;
  description: string | null;
}) => {
  const missing: string[] = [];

  if (!candidate.counterpartyId) {
    missing.push("counterparty");
  }

  if (!candidate.invoiceDate) {
    missing.push("invoice date");
  }

  if (!candidate.currency.trim()) {
    missing.push("currency");
  }

  if (!candidate.totalAmount.greaterThan(0)) {
    missing.push("total amount");
  }

  if (!candidate.description?.trim()) {
    missing.push("description");
  }

  return missing;
};

export default withAuth(async (req: AuthenticatedNextApiRequest, res: NextApiResponse) => {
  if (req.method !== "PATCH") {
    jsonError(res, 405, "Method not allowed");
    return;
  }

  try {
    const candidateId = typeof req.query.id === "string" ? req.query.id : null;

    if (!candidateId) {
      jsonError(res, 400, "Invoice candidate id is required");
      return;
    }

    const currentUser = await getCurrentUserRecord(req.user.id);

    if (!currentUser) {
      jsonError(res, 404, "User not found");
      return;
    }

    const candidate = await prisma.invoiceCandidate.findUnique({
      where: { id: candidateId },
      select: {
        id: true,
        entityId: true,
        documentId: true,
        counterpartyId: true,
        type: true,
        status: true,
        invoiceNumber: true,
        invoiceDate: true,
        dueDate: true,
        currency: true,
        subtotal: true,
        vatAmount: true,
        totalAmount: true,
        description: true,
        entity: {
          select: {
            organizationId: true,
          },
        },
        document: {
          select: {
            id: true,
            type: true,
            status: true,
            title: true,
            originalFilename: true,
          },
        },
      },
    });

    if (!candidate) {
      jsonError(res, 404, "Invoice candidate not found");
      return;
    }

    if (!(await canManageDocuments(currentUser, candidate.entityId))) {
      jsonError(res, 403, "Forbidden");
      return;
    }

    if (candidate.status === "ACCOUNTING_DRAFT_CREATED") {
      jsonError(
        res,
        400,
        "This invoice candidate already has a draft accounting transaction and can no longer be edited here"
      );
      return;
    }

    const body = req.body as UpdateInvoiceCandidateBody;
    const type = body.type === undefined ? undefined : getOptionalString(body.type)?.toUpperCase();
    const status =
      body.status === undefined ? undefined : getOptionalString(body.status)?.toUpperCase();
    const invoiceNumber =
      body.invoiceNumber === undefined ? undefined : getOptionalString(body.invoiceNumber) ?? null;
    const currency =
      body.currency === undefined
        ? undefined
        : getOptionalString(body.currency)?.toUpperCase() ?? "";
    const description =
      body.description === undefined ? undefined : getOptionalString(body.description) ?? null;
    const counterpartyId =
      body.counterpartyId === undefined
        ? undefined
        : getOptionalString(body.counterpartyId) ?? null;
    const invoiceDateResult = parseOptionalDateValue(body.invoiceDate);
    const dueDateResult = parseOptionalDateValue(body.dueDate);
    const subtotal =
      body.subtotal === undefined
        ? undefined
        : body.subtotal === "" || body.subtotal === null
          ? null
          : parseAmount(body.subtotal);
    const vatAmount =
      body.vatAmount === undefined
        ? undefined
        : body.vatAmount === "" || body.vatAmount === null
          ? null
          : parseAmount(body.vatAmount);
    const totalAmount =
      body.totalAmount === undefined
        ? undefined
        : body.totalAmount === "" || body.totalAmount === null
          ? null
          : parseAmount(body.totalAmount);

    if (type !== undefined && (!type || !INVOICE_CANDIDATE_TYPES.has(type))) {
      jsonError(res, 400, "A valid invoice candidate type is required");
      return;
    }

    if (status !== undefined && (!status || !INVOICE_CANDIDATE_STATUSES.has(status))) {
      jsonError(res, 400, "A valid invoice candidate status is required");
      return;
    }

    if (invoiceDateResult.value === "invalid") {
      jsonError(res, 400, "invoiceDate must be a valid ISO date string");
      return;
    }

    if (invoiceDateResult.provided && invoiceDateResult.value === null) {
      jsonError(res, 400, "invoiceDate is required");
      return;
    }

    if (dueDateResult.value === "invalid") {
      jsonError(res, 400, "dueDate must be a valid ISO date string");
      return;
    }

    if (body.subtotal !== undefined && body.subtotal !== "" && body.subtotal !== null && !subtotal) {
      jsonError(res, 400, "subtotal must be greater than 0");
      return;
    }

    if (body.vatAmount !== undefined && body.vatAmount !== "" && body.vatAmount !== null && !vatAmount) {
      jsonError(res, 400, "vatAmount must be greater than 0");
      return;
    }

    if (body.totalAmount !== undefined && !totalAmount) {
      jsonError(res, 400, "totalAmount must be greater than 0");
      return;
    }

    if (counterpartyId) {
      const counterparty = await prisma.counterparty.findUnique({
        where: { id: counterpartyId },
        select: {
          id: true,
          entityId: true,
        },
      });

      if (!counterparty) {
        jsonError(res, 404, "Counterparty not found");
        return;
      }

      if (counterparty.entityId !== candidate.entityId) {
        jsonError(res, 400, "Counterparty does not belong to the selected entity");
        return;
      }
    }

    const hasEditableFieldChanges =
      counterpartyId !== undefined ||
      type !== undefined ||
      invoiceNumber !== undefined ||
      invoiceDateResult.provided ||
      dueDateResult.provided ||
      currency !== undefined ||
      subtotal !== undefined ||
      vatAmount !== undefined ||
      totalAmount !== undefined ||
      description !== undefined;

    if (
      candidate.status === "READY_FOR_ACCOUNTING_REVIEW" &&
      hasEditableFieldChanges &&
      status !== "DRAFT"
    ) {
      jsonError(
        res,
        400,
        "Reopen the invoice candidate to DRAFT before editing its accounting fields"
      );
      return;
    }

    const nextSnapshot = {
      counterpartyId:
        counterpartyId !== undefined ? counterpartyId : candidate.counterpartyId,
      type: type ?? candidate.type,
      status: status ?? candidate.status,
      invoiceNumber:
        invoiceNumber !== undefined ? invoiceNumber : candidate.invoiceNumber,
      invoiceDate:
        invoiceDateResult.provided && invoiceDateResult.value instanceof Date
          ? invoiceDateResult.value
          : candidate.invoiceDate,
      dueDate:
        dueDateResult.provided
          ? dueDateResult.value instanceof Date
            ? dueDateResult.value
            : null
          : candidate.dueDate,
      currency: currency !== undefined ? currency : candidate.currency,
      subtotal: subtotal !== undefined ? subtotal : candidate.subtotal,
      vatAmount: vatAmount !== undefined ? vatAmount : candidate.vatAmount,
      totalAmount: totalAmount ?? candidate.totalAmount,
      description: description !== undefined ? description : candidate.description,
    };

    if (
      nextSnapshot.status === "READY_FOR_ACCOUNTING_REVIEW" &&
      candidate.document.status !== "REVIEWED"
    ) {
      jsonError(
        res,
        400,
        "The source document must remain REVIEWED before the candidate can move to accounting review"
      );
      return;
    }

    const readinessGaps =
      nextSnapshot.status === "READY_FOR_ACCOUNTING_REVIEW"
        ? getCandidateReadinessGaps({
            counterpartyId: nextSnapshot.counterpartyId,
            invoiceDate: nextSnapshot.invoiceDate,
            currency: nextSnapshot.currency,
            totalAmount: nextSnapshot.totalAmount,
            description: nextSnapshot.description,
          })
        : [];

    if (readinessGaps.length > 0) {
      jsonError(
        res,
        400,
        `Invoice candidate is not ready for accounting review. Missing: ${readinessGaps.join(
          ", "
        )}`
      );
      return;
    }

    const beforeSnapshot = {
      counterpartyId: candidate.counterpartyId,
      type: candidate.type,
      status: candidate.status,
      invoiceNumber: candidate.invoiceNumber,
      invoiceDate: candidate.invoiceDate,
      dueDate: candidate.dueDate,
      currency: candidate.currency,
      subtotal: candidate.subtotal?.toFixed(2) ?? null,
      vatAmount: candidate.vatAmount?.toFixed(2) ?? null,
      totalAmount: candidate.totalAmount.toFixed(2),
      description: candidate.description,
    };
    const afterSnapshot = {
      ...nextSnapshot,
      subtotal: nextSnapshot.subtotal?.toFixed(2) ?? null,
      vatAmount: nextSnapshot.vatAmount?.toFixed(2) ?? null,
      totalAmount: nextSnapshot.totalAmount.toFixed(2),
    };

    const changedFields = Object.entries(afterSnapshot)
      .filter(([key, value]) => {
        const beforeValue = beforeSnapshot[key as keyof typeof beforeSnapshot];

        if (beforeValue instanceof Date || value instanceof Date) {
          const beforeDate =
            beforeValue instanceof Date ? beforeValue.toISOString() : beforeValue;
          const afterDate = value instanceof Date ? value.toISOString() : value;
          return beforeDate !== afterDate;
        }

        return beforeValue !== value;
      })
      .map(([key]) => key);

    if (!changedFields.length) {
      const unchangedCandidate = await prisma.invoiceCandidate.findUnique({
        where: { id: candidate.id },
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

      jsonSuccess(res, unchangedCandidate ? serializeInvoiceCandidate(unchangedCandidate) : candidate);
      return;
    }

    const updatedCandidate = await prisma.$transaction(async (tx) => {
      const updated = await tx.invoiceCandidate.update({
        where: { id: candidate.id },
        data: {
          counterpartyId: nextSnapshot.counterpartyId,
          type: nextSnapshot.type,
          status: nextSnapshot.status,
          invoiceNumber: nextSnapshot.invoiceNumber,
          invoiceDate: nextSnapshot.invoiceDate,
          dueDate: nextSnapshot.dueDate,
          currency: nextSnapshot.currency,
          subtotal: nextSnapshot.subtotal,
          vatAmount: nextSnapshot.vatAmount,
          totalAmount: nextSnapshot.totalAmount,
          description: nextSnapshot.description,
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

      if (changedFields.some((field) => field !== "status")) {
        await createAuditLog(tx, {
          userId: req.user.id,
          organizationId: candidate.entity.organizationId,
          entityId: candidate.entityId,
          action: "INVOICE_CANDIDATE_UPDATED",
          resourceType: "InvoiceCandidate",
          resourceId: candidate.id,
          metadata: {
            changedFields: changedFields.filter((field) => field !== "status"),
            before: beforeSnapshot,
            after: afterSnapshot,
          },
        });
      }

      if (candidate.status !== updated.status) {
        await createAuditLog(tx, {
          userId: req.user.id,
          organizationId: candidate.entity.organizationId,
          entityId: candidate.entityId,
          action: "INVOICE_CANDIDATE_STATUS_CHANGED",
          resourceType: "InvoiceCandidate",
          resourceId: candidate.id,
          metadata: {
            documentId: candidate.documentId,
            beforeStatus: candidate.status,
            afterStatus: updated.status,
          },
        });
      }

      return updated;
    });

    jsonSuccess(res, serializeInvoiceCandidate(updatedCandidate));
  } catch (error) {
    console.error("UPDATE INVOICE CANDIDATE ERROR:", error);
    jsonError(res, 500, "Internal server error");
  }
});
