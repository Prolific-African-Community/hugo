import type { NextApiResponse } from "next";
import { getOptionalString, jsonError, jsonSuccess } from "../../../../lib/accounting-api";
import { createAuditLog } from "../../../../lib/audit-log";
import { AuthenticatedNextApiRequest, withAuth } from "../../../../lib/auth";
import { getCurrentUserRecord } from "../../../../lib/entity-access";
import { canManageDocuments } from "../../../../lib/permissions";
import { prisma } from "../../../../lib/prisma";

const ALLOWED_DOCUMENT_STATUSES = new Set([
  "UPLOADED",
  "PROCESSING",
  "REVIEWED",
  "REJECTED",
  "FAILED",
]);

interface UpdateDocumentBody {
  status?: unknown;
}

export default withAuth(async (req: AuthenticatedNextApiRequest, res: NextApiResponse) => {
  if (req.method !== "PATCH") {
    jsonError(res, 405, "Method not allowed");
    return;
  }

  try {
    const documentId = typeof req.query.id === "string" ? req.query.id : null;

    if (!documentId) {
      jsonError(res, 400, "Document id is required");
      return;
    }

    const currentUser = await getCurrentUserRecord(req.user.id);

    if (!currentUser) {
      jsonError(res, 404, "User not found");
      return;
    }

    const document = await prisma.document.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        entityId: true,
        type: true,
        title: true,
        originalFilename: true,
        status: true,
        entity: {
          select: {
            organizationId: true,
          },
        },
      },
    });

    if (!document) {
      jsonError(res, 404, "Document not found");
      return;
    }

    if (!(await canManageDocuments(currentUser, document.entityId))) {
      jsonError(res, 403, "Forbidden");
      return;
    }

    const body = req.body as UpdateDocumentBody;
    const status = getOptionalString(body.status)?.toUpperCase();

    if (!status || !ALLOWED_DOCUMENT_STATUSES.has(status)) {
      jsonError(res, 400, "A valid document status is required");
      return;
    }

    if (status === document.status) {
      jsonSuccess(res, document);
      return;
    }

    const updatedDocument = await prisma.$transaction(async (tx) => {
      const updated = await tx.document.update({
        where: { id: document.id },
        data: { status },
        include: {
          counterparty: {
            select: {
              id: true,
              name: true,
              type: true,
            },
          },
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
          uploadedBy: {
            select: {
              id: true,
              email: true,
            },
          },
        },
      });

      await createAuditLog(tx, {
        userId: req.user.id,
        organizationId: document.entity.organizationId,
        entityId: document.entityId,
        action: "DOCUMENT_STATUS_CHANGED",
        resourceType: "Document",
        resourceId: document.id,
        metadata: {
          documentId: document.id,
          type: document.type,
          title: document.title,
          fileName: document.originalFilename,
          beforeStatus: document.status,
          afterStatus: updated.status,
        },
      });

      return updated;
    });

    jsonSuccess(res, {
      ...updatedDocument,
      downloadUrl: `/api/accounting/documents/${updatedDocument.id}/download`,
    });
  } catch (error) {
    console.error("UPDATE ACCOUNTING DOCUMENT ERROR:", error);
    jsonError(res, 500, "Internal server error");
  }
});
