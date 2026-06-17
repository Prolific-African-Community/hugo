import type { NextApiResponse } from 'next';
import { getQueryString, jsonError, jsonSuccess } from '../../../lib/accounting-api';
import { AuthenticatedNextApiRequest, withAuth } from '../../../lib/auth';
import { getCurrentUserRecord } from '../../../lib/entity-access';
import { canAccessEntity } from '../../../lib/permissions';
import { prisma } from '../../../lib/prisma';
import { measureStep } from '../../../lib/performance-log';

type AuditMetadataRecord = Record<string, unknown>;

const asRecord = (value: unknown): AuditMetadataRecord | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as AuditMetadataRecord;
};

const asString = (value: unknown) => (typeof value === 'string' ? value : null);

const buildProposalLineExplanation = ({
  lineType,
  accountCode,
  accountLabel,
  sourceDescription,
  transactionType,
}: {
  lineType: 'DEBIT' | 'CREDIT';
  accountCode?: string | null;
  accountLabel?: string | null;
  sourceDescription?: string | null;
  transactionType?: string | null;
}) => {
  const accountText = [accountCode, accountLabel].filter(Boolean).join(' ');
  const reason = sourceDescription || transactionType || 'invoice workflow';

  if (lineType === 'DEBIT') {
    return `Debit ${accountText || 'selected expense account'} based on ${reason}.`;
  }

  return `Credit ${accountText || 'selected payable or income account'} based on ${reason}.`;
};

export default withAuth(async (req: AuthenticatedNextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') {
    jsonError(res, 405, 'Method not allowed');
    return;
  }

  const entityId = getQueryString(req.query.entityId);
  const transactionId = getQueryString(req.query.transactionId);
  const rawLimit = Number(getQueryString(req.query.limit) || 50);
  const rawOffset = Number(getQueryString(req.query.offset) || 0);
  const limit = Number.isInteger(rawLimit) ? Math.min(Math.max(rawLimit, 1), 100) : 50;
  const offset = Number.isInteger(rawOffset) && rawOffset > 0 ? rawOffset : 0;

  if (!entityId) {
    jsonError(res, 400, 'entityId is required');
    return;
  }

  try {
    const currentUser = await measureStep('GET /api/accounting/journal-entries current user', () =>
      getCurrentUserRecord(req.user.id)
    );
    if (!currentUser || !(await canAccessEntity(currentUser, entityId))) {
      jsonError(res, 403, 'Forbidden');
      return;
    }

    const journalEntries = await measureStep('GET /api/accounting/journal-entries list', () =>
      prisma.journalEntry.findMany({
      where: {
        entityId,
        ...(transactionId ? { transactionId } : {}),
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: limit,
      skip: offset,
      select: {
        id: true,
        transactionId: true,
        date: true,
        description: true,
        status: true,
        transaction: {
          select: {
            id: true,
            type: true,
            amount: true,
            currency: true,
            status: true,
            description: true,
            documents: {
              orderBy: [{ createdAt: 'desc' }],
              take: 1,
              select: {
                id: true,
                title: true,
                originalFilename: true,
                type: true,
                status: true,
                invoiceCandidate: {
                  select: {
                    id: true,
                    status: true,
                    type: true,
                    invoiceNumber: true,
                    invoiceDate: true,
                    dueDate: true,
                    currency: true,
                    subtotal: true,
                    vatAmount: true,
                    totalAmount: true,
                    description: true,
                    counterparty: {
                      select: {
                        id: true,
                        name: true,
                        type: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
        lines: {
          select: {
            id: true,
            debit: true,
            credit: true,
            currency: true,
            description: true,
            account: {
              select: {
                id: true,
                code: true,
                label: true,
              },
            },
            counterparty: {
              select: {
                id: true,
                name: true,
              },
            },
            project: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    })
    );

    const transactionIds = journalEntries
      .map((entry) => entry.transactionId)
      .filter((value): value is string => Boolean(value));

    const auditLogs =
      transactionIds.length > 0
        ? await measureStep('GET /api/accounting/journal-entries audit lookups', () =>
            prisma.auditLog.findMany({
              where: {
                entityId,
                resourceType: 'BusinessTransaction',
                action: 'BUSINESS_TRANSACTION_CREATED',
                resourceId: {
                  in: transactionIds,
                },
              },
              select: {
                resourceId: true,
                metadata: true,
              },
            })
          )
        : [];

    const auditMetadataByTransactionId = new Map(
      auditLogs
        .filter((log) => log.resourceId)
        .map((log) => [log.resourceId as string, asRecord(log.metadata)])
    );

    const serializedEntries = journalEntries.map((entry) => {
      const sourceDocument = entry.transaction?.documents?.[0] || null;
      const invoiceCandidate = sourceDocument?.invoiceCandidate || null;
      const auditMetadata = entry.transactionId
        ? auditMetadataByTransactionId.get(entry.transactionId) || null
        : null;
      const proposalSummary = asRecord(auditMetadata?.proposalSummary);
      const rule = asRecord(auditMetadata?.rule);
      const ruleDebitAccount = asRecord(rule?.debitAccount);
      const ruleCreditAccount = asRecord(rule?.creditAccount);
      const sourceDescription =
        asString(proposalSummary?.sourceDescription) ||
        invoiceCandidate?.description ||
        entry.transaction?.description ||
        entry.description;
      const debitLine = entry.lines.find((line) => Number(line.debit) > 0) || null;
      const creditLine = entry.lines.find((line) => Number(line.credit) > 0) || null;
      const debitTotal = entry.lines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
      const creditTotal = entry.lines.reduce((sum, line) => sum + Number(line.credit || 0), 0);
      const isBalanced = Math.abs(debitTotal - creditTotal) < 0.0001;
      const hasVatCaptured = invoiceCandidate?.vatAmount !== null && invoiceCandidate?.vatAmount !== undefined;

      const indicators = [
        {
          label: 'Journal balanced',
          ready: isBalanced,
          detail: isBalanced ? 'Debit and credit totals match.' : 'Debit and credit totals do not match.',
        },
        {
          label: 'Source document linked',
          ready: sourceDocument?.status === 'LINKED',
          detail:
            sourceDocument?.status === 'LINKED'
              ? 'Document is linked to the accounting draft.'
              : 'Document is not in LINKED status.',
        },
        {
          label: 'Counterparty identified',
          ready: Boolean(invoiceCandidate?.counterparty?.name),
          detail: invoiceCandidate?.counterparty?.name || 'Counterparty missing.',
        },
        {
          label: 'Rule context visible',
          ready: Boolean(rule || (debitLine && creditLine && entry.transaction?.type)),
          detail: rule
            ? `Rule ${asString(rule.transactionType) || entry.transaction?.type || 'unknown'} was captured at draft creation.`
            : 'Rule snapshot missing. Review against current accounting rules manually.',
        },
        {
          label: 'VAT reviewed',
          ready: hasVatCaptured,
          detail: hasVatCaptured
            ? 'VAT amount is captured on the invoice candidate.'
            : 'No VAT amount captured. Manual VAT review required.',
        },
      ];

      const warnings = indicators.filter((indicator) => !indicator.ready).map((indicator) => indicator.detail);

      const reviewContext =
        entry.transaction && sourceDocument && invoiceCandidate
          ? {
              source: 'invoice-candidate',
              sourceDocument: {
                id: sourceDocument.id,
                title: sourceDocument.title,
                originalFilename: sourceDocument.originalFilename,
                type: sourceDocument.type,
                status: sourceDocument.status,
              },
              invoiceCandidate: {
                id: invoiceCandidate.id,
                status: invoiceCandidate.status,
                type: invoiceCandidate.type,
                invoiceNumber: invoiceCandidate.invoiceNumber,
                invoiceDate: invoiceCandidate.invoiceDate,
                dueDate: invoiceCandidate.dueDate,
                currency: invoiceCandidate.currency,
                subtotal: invoiceCandidate.subtotal?.toFixed(2) ?? null,
                vatAmount: invoiceCandidate.vatAmount?.toFixed(2) ?? null,
                totalAmount: invoiceCandidate.totalAmount.toFixed(2),
                description: invoiceCandidate.description,
                counterparty: invoiceCandidate.counterparty,
              },
              transaction: {
                id: entry.transaction.id,
                type: entry.transaction.type,
                amount: entry.transaction.amount.toFixed(2),
                currency: entry.transaction.currency,
                status: entry.transaction.status,
                description: entry.transaction.description,
              },
              ruleUsed: {
                id: asString(rule?.id),
                transactionType: asString(rule?.transactionType) || entry.transaction.type,
                descriptionTemplate: asString(rule?.descriptionTemplate),
                debitAccount: {
                  id: asString(ruleDebitAccount?.id) || debitLine?.account?.id || null,
                  code: asString(ruleDebitAccount?.code) || debitLine?.account?.code || null,
                  label: asString(ruleDebitAccount?.label) || debitLine?.account?.label || null,
                },
                creditAccount: {
                  id: asString(ruleCreditAccount?.id) || creditLine?.account?.id || null,
                  code: asString(ruleCreditAccount?.code) || creditLine?.account?.code || null,
                  label: asString(ruleCreditAccount?.label) || creditLine?.account?.label || null,
                },
              },
              proposalLines: entry.lines.map((line) => ({
                id: line.id,
                type: Number(line.debit) > 0 ? 'DEBIT' : 'CREDIT',
                accountCode: line.account?.code || null,
                accountLabel: line.account?.label || null,
                amount:
                  Number(line.debit) > 0
                    ? line.debit.toFixed(2)
                    : line.credit.toFixed(2),
                currency: line.currency,
                explanation: buildProposalLineExplanation({
                  lineType: Number(line.debit) > 0 ? 'DEBIT' : 'CREDIT',
                  accountCode: line.account?.code || null,
                  accountLabel: line.account?.label || null,
                  sourceDescription,
                  transactionType: entry.transaction?.type || null,
                }),
              })),
              readiness: {
                readyToPost: indicators.every((indicator) => indicator.ready),
                indicators,
              },
              warnings,
            }
          : null;

      return {
        ...entry,
        transaction: entry.transaction
          ? {
              ...entry.transaction,
              amount: entry.transaction.amount.toFixed(2),
            }
          : null,
        reviewContext,
      };
    });

    jsonSuccess(res, serializedEntries);
  } catch (error) {
    console.error('ACCOUNTING JOURNAL ENTRIES ERROR:', error);
    jsonError(res, 500, 'Internal server error');
  }
});
