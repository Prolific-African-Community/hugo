import { Prisma } from "@prisma/client";
import type { NextApiResponse } from "next";
import { jsonError, jsonSuccess } from "../../../lib/accounting-api";
import { AuthenticatedNextApiRequest, withAuth } from "../../../lib/auth";
import { requireHugoCabinet } from "../../../lib/hugo-auth";
import { prisma } from "../../../lib/prisma";

const TAKE_LIMIT = 20;

const patientSelect = {
  id: true,
  firstName: true,
  lastName: true,
};

const prescriptionSelect = {
  id: true,
  title: true,
  prescribedSessions: true,
  completedSessions: true,
  status: true,
  patient: {
    select: patientSelect,
  },
};

interface PrescriptionIdRow {
  id: string;
}

interface CompletionDateRow {
  prescriptionId: string;
  completionDate: Date | null;
}

const sortByIdOrder = <T extends { id: string }>(items: T[], ids: string[]) => {
  const order = new Map(ids.map((id, index) => [id, index]));
  return [...items].sort(
    (left, right) => (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0)
  );
};

const withReadinessFields = <
  T extends {
    id: string;
    title: string;
    prescribedSessions: number;
    completedSessions: number;
    patient: { id: string; firstName: string; lastName: string };
  }
>(
  prescription: T
) => ({
  patient: prescription.patient,
  prescription: {
    id: prescription.id,
    title: prescription.title,
  },
  prescribedSessions: prescription.prescribedSessions,
  completedSessions: prescription.completedSessions,
  remainingSessions: Math.max(
    0,
    prescription.prescribedSessions - prescription.completedSessions
  ),
});

const getPrescriptionsByIds = async (ids: string[]) => {
  if (!ids.length) return [];

  const prescriptions = await prisma.prescription.findMany({
    where: { id: { in: ids } },
    select: prescriptionSelect,
  });

  return sortByIdOrder(prescriptions, ids);
};

const getBillingReadiness = async (
  req: AuthenticatedNextApiRequest,
  res: NextApiResponse
) => {
  const cabinet = await requireHugoCabinet(req);

  if (!cabinet) {
    return jsonError(res, 404, "Cabinet not found");
  }

  const [
    attentionRows,
    draftRows,
    readyRows,
  ] = await Promise.all([
    prisma.$queryRaw<PrescriptionIdRow[]>`
      SELECT "id"
      FROM "Prescription"
      WHERE "entityId" = ${cabinet.cabinetId}
        AND "status" = 'ACTIVE'
        AND ("prescribedSessions" - "completedSessions") <= 2
      ORDER BY "updatedAt" DESC
      LIMIT ${TAKE_LIMIT}
    `,
    prisma.$queryRaw<PrescriptionIdRow[]>`
      SELECT p."id"
      FROM "Prescription" p
      WHERE p."entityId" = ${cabinet.cabinetId}
        AND p."status" = 'ACTIVE'
        AND (p."prescribedSessions" - p."completedSessions") <= 1
        AND NOT EXISTS (
          SELECT 1
          FROM "Invoice" i
          WHERE i."prescriptionId" = p."id"
            AND i."entityId" = ${cabinet.cabinetId}
            AND i."status" <> 'CANCELLED'
        )
      ORDER BY p."updatedAt" DESC
      LIMIT ${TAKE_LIMIT}
    `,
    prisma.$queryRaw<PrescriptionIdRow[]>`
      SELECT p."id"
      FROM "Prescription" p
      WHERE p."entityId" = ${cabinet.cabinetId}
        AND p."completedSessions" >= p."prescribedSessions"
        AND NOT EXISTS (
          SELECT 1
          FROM "Invoice" i
          WHERE i."prescriptionId" = p."id"
            AND i."entityId" = ${cabinet.cabinetId}
            AND i."status" IN ('READY', 'ISSUED', 'PAID')
        )
      ORDER BY p."updatedAt" DESC
      LIMIT ${TAKE_LIMIT}
    `,
  ]);

  const attentionIds = attentionRows.map((row) => row.id);
  const draftIds = draftRows.map((row) => row.id);
  const readyIds = readyRows.map((row) => row.id);

  const [
    attentionPrescriptions,
    draftPrescriptions,
    readyPrescriptions,
    completionRows,
  ] = await Promise.all([
    getPrescriptionsByIds(attentionIds),
    getPrescriptionsByIds(draftIds),
    getPrescriptionsByIds(readyIds),
    readyIds.length
      ? prisma.$queryRaw<CompletionDateRow[]>`
          SELECT "prescriptionId", MAX("completedAt") AS "completionDate"
          FROM "TherapySession"
          WHERE "entityId" = ${cabinet.cabinetId}
            AND "prescriptionId" IN (${Prisma.join(readyIds)})
            AND "status" = 'COMPLETED'
          GROUP BY "prescriptionId"
        `
      : Promise.resolve([]),
  ]);

  const completionDatesByPrescription = new Map(
    completionRows.map((row) => [row.prescriptionId, row.completionDate])
  );

  return jsonSuccess(res, {
    prescriptionsNeedingAttention: attentionPrescriptions.map(
      withReadinessFields
    ),
    invoiceDraftCandidates: draftPrescriptions.map((prescription) => ({
      ...withReadinessFields(prescription),
      suggestedAmountCents: 0,
      suggestedCurrency: "EUR",
    })),
    invoiceReadyCandidates: readyPrescriptions.map((prescription) => ({
      ...withReadinessFields(prescription),
      completionDate:
        completionDatesByPrescription.get(prescription.id)?.toISOString() ||
        null,
    })),
  });
};

export default withAuth(
  async (req: AuthenticatedNextApiRequest, res: NextApiResponse) => {
    try {
      if (req.method === "GET") {
        return await getBillingReadiness(req, res);
      }

      return jsonError(res, 405, "Method not allowed");
    } catch (error) {
      console.error("HUGO BILLING READINESS ERROR:", error);
      return jsonError(res, 500, "Internal server error");
    }
  }
);
