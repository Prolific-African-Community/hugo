import { JournalEntryStatus, TransactionStatus, TransactionType } from "@prisma/client";
import type { NextApiResponse } from "next";
import {
  applyDescriptionTemplate,
  jsonError,
  jsonSuccess,
} from "../../../../../lib/accounting-api";
import { createAuditLog } from "../../../../../lib/audit-log";
import { AuthenticatedNextApiRequest, withAuth } from "../../../../../lib/auth";
import { getCurrentUserRecord } from "../../../../../lib/entity-access";
import { getEntityPermissionSummaryForContext } from "../../../../../lib/permissions";
import { prisma } from "../../../../../lib/prisma";

const transactionTypeFromCandidate = (type: string): TransactionType =>
  type === "CUSTOMER" ? TransactionType.CUSTOMER_INVOICE : TransactionType.SUPPLIER_INVOICE;

export default withAuth(async (req: AuthenticatedNextApiRequest, res: NextApiResponse) => {
  if (req.method !== "POST") {
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
        counterpartyId: true,
        type: true,
        status: true,
        invoiceNumber: true,
        invoiceDate: true,
        dueDate: true,
        currency: true,
        totalAmount: true,
        description: true,
        entity: {
          select: {
            id: true,
            organizationId: true,
            baseCurrency: true,
            organization: {
              select: {
                isActive: true,
                status: true,
              },
            },
          },
        },
        document: {
          select: {
            id: true,
            status: true,
            transactionId: true,
            counterpartyId: true,
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

    const permissions = getEntityPermissionSummaryForContext(currentUser, {
      entityId: candidate.entityId,
      organizationId: candidate.entity.organizationId,
      organizationIsActive: candidate.entity.organization.isActive,
      organizationStatus: candidate.entity.organization.status,
    });

    if (!permissions.canCreateAccountingTransaction) {
      jsonError(res, 403, "Forbidden");
      return;
    }

    if (candidate.status !== "READY_FOR_ACCOUNTING_REVIEW") {
      jsonError(
        res,
        400,
        "Only invoice candidates ready for accounting review can create a draft accounting transaction"
      );
      return;
    }

    if (candidate.document.status !== "REVIEWED") {
      jsonError(
        res,
        400,
        "The source document must remain REVIEWED before creating a draft accounting transaction"
      );
      return;
    }

    if (candidate.document.transactionId) {
      jsonError(res, 409, "A draft accounting transaction already exists for this invoice candidate");
      return;
    }

    const transactionType = transactionTypeFromCandidate(candidate.type);
    const rule =
      (await prisma.accountingRule.findFirst({
        where: {
          entityId: candidate.entityId,
          transactionType,
          isActive: true,
        },
        orderBy: { priority: "asc" },
        select: {
          id: true,
          transactionType: true,
          descriptionTemplate: true,
          debitAccountId: true,
          creditAccountId: true,
          debitAccount: {
            select: {
              id: true,
              code: true,
              label: true,
            },
          },
          creditAccount: {
            select: {
              id: true,
              code: true,
              label: true,
            },
          },
        },
      })) ||
      (await prisma.accountingRule.findFirst({
        where: {
          entityId: null,
          transactionType,
          isActive: true,
        },
        orderBy: { priority: "asc" },
        select: {
          id: true,
          transactionType: true,
          descriptionTemplate: true,
          debitAccountId: true,
          creditAccountId: true,
          debitAccount: {
            select: {
              id: true,
              code: true,
              label: true,
            },
          },
          creditAccount: {
            select: {
              id: true,
              code: true,
              label: true,
            },
          },
        },
      }));

    if (!rule) {
      jsonError(res, 400, `No active accounting rule found for ${transactionType}`);
      return;
    }

    const description =
      candidate.description ||
      candidate.invoiceNumber ||
      candidate.document.title ||
      candidate.document.originalFilename ||
      transactionType;
    const journalDescription = applyDescriptionTemplate(
      rule.descriptionTemplate,
      description,
      transactionType
    );

    const result = await prisma.$transaction(async (tx) => {
      const transaction = await tx.businessTransaction.create({
        data: {
          entityId: candidate.entityId,
          counterpartyId: candidate.counterpartyId || candidate.document.counterpartyId || undefined,
          type: transactionType,
          amount: candidate.totalAmount,
          currency: candidate.currency || candidate.entity.baseCurrency || "EUR",
          date: candidate.invoiceDate,
          description,
          status: TransactionStatus.DRAFT,
          createdById: req.user.id,
        },
      });

      const journalEntry = await tx.journalEntry.create({
        data: {
          entityId: candidate.entityId,
          transactionId: transaction.id,
          date: candidate.invoiceDate,
          description: journalDescription,
          status: JournalEntryStatus.DRAFT,
          createdById: req.user.id,
          lines: {
            create: [
              {
                accountId: rule.debitAccountId,
                counterpartyId:
                  candidate.counterpartyId || candidate.document.counterpartyId || undefined,
                debit: candidate.totalAmount,
                credit: 0,
                currency: candidate.currency || candidate.entity.baseCurrency || "EUR",
              },
              {
                accountId: rule.creditAccountId,
                counterpartyId:
                  candidate.counterpartyId || candidate.document.counterpartyId || undefined,
                debit: 0,
                credit: candidate.totalAmount,
                currency: candidate.currency || candidate.entity.baseCurrency || "EUR",
              },
            ],
          },
        },
        select: {
          id: true,
          date: true,
          description: true,
          status: true,
        },
      });

      const updatedDocument = await tx.document.update({
        where: { id: candidate.document.id },
        data: {
          transactionId: transaction.id,
          counterpartyId: candidate.counterpartyId || candidate.document.counterpartyId || undefined,
          status: "LINKED",
        },
        select: {
          id: true,
          status: true,
          transactionId: true,
        },
      });

      const updatedCandidate = await tx.invoiceCandidate.update({
        where: { id: candidate.id },
        data: {
          status: "ACCOUNTING_DRAFT_CREATED",
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
                  type: true,
                  amount: true,
                  currency: true,
                  status: true,
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
        organizationId: candidate.entity.organizationId,
        entityId: candidate.entityId,
        action: "BUSINESS_TRANSACTION_CREATED",
        resourceType: "BusinessTransaction",
        resourceId: transaction.id,
        metadata: {
          type: transaction.type,
          amount: transaction.amount.toString(),
          currency: transaction.currency,
          journalEntryId: journalEntry.id,
          source: "invoice-candidate",
          invoiceCandidateId: candidate.id,
          documentId: candidate.document.id,
          rule: {
            id: rule.id,
            transactionType: rule.transactionType,
            descriptionTemplate: rule.descriptionTemplate,
            debitAccount: rule.debitAccount,
            creditAccount: rule.creditAccount,
          },
          proposalSummary: {
            invoiceNumber: candidate.invoiceNumber,
            invoiceDate: candidate.invoiceDate,
            dueDate: candidate.dueDate,
            candidateType: candidate.type,
            counterpartyId:
              candidate.counterpartyId || candidate.document.counterpartyId || null,
            sourceDescription: description,
          },
        },
      });

      await createAuditLog(tx, {
        userId: req.user.id,
        organizationId: candidate.entity.organizationId,
        entityId: candidate.entityId,
        action: "INVOICE_CANDIDATE_ACCOUNTING_DRAFT_CREATED",
        resourceType: "InvoiceCandidate",
        resourceId: candidate.id,
        metadata: {
          beforeStatus: candidate.status,
          afterStatus: updatedCandidate.status,
          transactionId: transaction.id,
          journalEntryId: journalEntry.id,
          transactionType,
        },
      });

      await createAuditLog(tx, {
        userId: req.user.id,
        organizationId: candidate.entity.organizationId,
        entityId: candidate.entityId,
        action: "DOCUMENT_STATUS_CHANGED",
        resourceType: "Document",
        resourceId: candidate.document.id,
        metadata: {
          documentId: candidate.document.id,
          beforeStatus: candidate.document.status,
          afterStatus: updatedDocument.status,
          transactionId: updatedDocument.transactionId,
        },
      });

      return {
        candidate: {
          ...updatedCandidate,
          subtotal: updatedCandidate.subtotal?.toFixed(2) ?? null,
          vatAmount: updatedCandidate.vatAmount?.toFixed(2) ?? null,
          totalAmount: updatedCandidate.totalAmount.toFixed(2),
        },
        transaction: {
          id: transaction.id,
          date: transaction.date,
          type: transaction.type,
          amount: transaction.amount.toFixed(2),
          currency: transaction.currency,
          status: transaction.status,
          description: transaction.description,
        },
        journalEntry,
      };
    });

    jsonSuccess(res, result, 201);
  } catch (error) {
    console.error("CREATE INVOICE CANDIDATE TRANSACTION ERROR:", error);
    jsonError(res, 500, "Internal server error");
  }
});
