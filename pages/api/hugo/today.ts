import type { NextApiResponse } from "next";
import { Prisma } from "@prisma/client";
import { jsonError, jsonSuccess } from "../../../lib/accounting-api";
import { AuthenticatedNextApiRequest, withAuth } from "../../../lib/auth";
import { requireHugoCabinet } from "../../../lib/hugo-auth";
import { prisma } from "../../../lib/prisma";

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
};

const appointmentSelect = {
  id: true,
  startsAt: true,
  endsAt: true,
  status: true,
  source: true,
  notes: true,
  patient: {
    select: patientSelect,
  },
  session: {
    select: {
      id: true,
      status: true,
      sessionNumber: true,
      prescription: {
        select: prescriptionSelect,
      },
    },
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

const getPrescriptionsByIds = async (ids: string[]) => {
  if (!ids.length) return [];

  const prescriptions = await prisma.prescription.findMany({
    where: { id: { in: ids } },
    select: {
      ...prescriptionSelect,
      patient: {
        select: patientSelect,
      },
    },
  });

  return sortByIdOrder(prescriptions, ids);
};

const toBillingAction = (
  type: "ATTENTION" | "DRAFT" | "READY",
  prescription: Awaited<ReturnType<typeof getPrescriptionsByIds>>[number],
  completionDate?: Date | null
) => {
  const remainingSessions = Math.max(
    0,
    prescription.prescribedSessions - prescription.completedSessions
  );

  return {
    type,
    patient: prescription.patient,
    prescription: {
      id: prescription.id,
      title: prescription.title,
    },
    prescribedSessions: prescription.prescribedSessions,
    completedSessions: prescription.completedSessions,
    remainingSessions,
    suggestedAmountCents: type === "DRAFT" ? 0 : undefined,
    suggestedCurrency: type === "DRAFT" ? "EUR" : undefined,
    completionDate: completionDate?.toISOString() || null,
  };
};

const serializeAppointment = <
  T extends { session?: { id: string } | null }
>(
  appointment: T
) => {
  const { session, ...rest } = appointment;

  return {
    ...rest,
    linkedSessionId: session?.id || null,
    hasSession: Boolean(session?.id),
    linkedSession: session || null,
  };
};

const getToday = async (
  req: AuthenticatedNextApiRequest,
  res: NextApiResponse
) => {
  const cabinet = await requireHugoCabinet(req);

  if (!cabinet) {
    return jsonError(res, 404, "Cabinet not found");
  }

  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);

  const [
    todayAppointments,
    upcomingAppointments,
    attentionRows,
    draftRows,
    readyRows,
  ] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        entityId: cabinet.cabinetId,
        startsAt: {
          gte: startOfToday,
          lt: endOfToday,
        },
      },
      select: appointmentSelect,
      orderBy: { startsAt: "asc" },
    }),
    prisma.appointment.findMany({
      where: {
        entityId: cabinet.cabinetId,
        startsAt: { gte: now },
      },
      select: appointmentSelect,
      orderBy: { startsAt: "asc" },
      take: 10,
    }),
    prisma.$queryRaw<PrescriptionIdRow[]>`
      SELECT "id"
      FROM "Prescription"
      WHERE "entityId" = ${cabinet.cabinetId}
        AND "status" = 'ACTIVE'
        AND ("prescribedSessions" - "completedSessions") <= 2
      ORDER BY "updatedAt" DESC
      LIMIT 10
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
      LIMIT 10
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
      LIMIT 10
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

  const billingActions = [
    ...readyPrescriptions.map((prescription) =>
      toBillingAction(
        "READY",
        prescription,
        completionDatesByPrescription.get(prescription.id) || null
      )
    ),
    ...draftPrescriptions.map((prescription) =>
      toBillingAction("DRAFT", prescription)
    ),
    ...attentionPrescriptions.map((prescription) =>
      toBillingAction("ATTENTION", prescription)
    ),
  ].slice(0, 15);

  const serializedTodayAppointments = todayAppointments.map(
    serializeAppointment
  );
  const serializedUpcomingAppointments = upcomingAppointments.map(
    serializeAppointment
  );
  const sessionsAlreadyCreatedToday = serializedTodayAppointments.filter(
    (appointment) => appointment.hasSession
  ).length;
  const appointmentsWithoutSessionToday =
    serializedTodayAppointments.length - sessionsAlreadyCreatedToday;

  return jsonSuccess(res, {
    cabinet: {
      cabinetId: cabinet.cabinetId,
      name: cabinet.cabinetName,
    },
    todayAppointments: serializedTodayAppointments,
    upcomingAppointments: serializedUpcomingAppointments,
    billingActions,
    summary: {
      appointmentsToday: serializedTodayAppointments.length,
      sessionsAlreadyCreatedToday,
      appointmentsWithoutSessionToday,
      invoicesToPrepare: draftPrescriptions.length,
      invoicesReady: readyPrescriptions.length,
    },
  });
};

export default withAuth(
  async (req: AuthenticatedNextApiRequest, res: NextApiResponse) => {
    try {
      if (req.method === "GET") {
        return await getToday(req, res);
      }

      return jsonError(res, 405, "Method not allowed");
    } catch (error) {
      console.error("HUGO TODAY ERROR:", error);
      return jsonError(res, 500, "Internal server error");
    }
  }
);
