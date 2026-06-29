import type { NextApiResponse } from "next";
import { Prisma } from "@prisma/client";
import {
  getQueryString,
  jsonError,
  jsonSuccess,
} from "../../../lib/accounting-api";
import { AuthenticatedNextApiRequest, withAuth } from "../../../lib/auth";
import { cleanCalendarNotes } from "../../../lib/hugo-display";
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
    notes:
      "notes" in rest && typeof rest.notes === "string"
        ? cleanCalendarNotes(rest.notes)
        : "notes" in rest
          ? rest.notes
          : null,
    linkedSessionId: session?.id || null,
    hasSession: Boolean(session?.id),
    linkedSession: session || null,
  };
};

const startOfDay = (date: Date) => {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
};

const addDays = (date: Date, days: number) => {
  const value = new Date(date);
  value.setDate(value.getDate() + days);
  return value;
};

const toDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseDateParam = (value: string | null) => {
  if (!value) return null;

  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : startOfDay(date);
};

const parseDaysParam = (value: string | null) => {
  const parsed = value ? Number(value) : 3;
  return parsed === 1 || parsed === 3 ? parsed : 3;
};

const sortAppointmentsByStart = <
  T extends { startsAt: Date | string }
>(
  appointments: T[]
) => {
  return [...appointments].sort(
    (left, right) =>
      new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime()
  );
};

const dayLabel = (date: Date) => {
  const today = startOfDay(new Date());
  const tomorrow = addDays(today, 1);

  if (toDateKey(date) === toDateKey(today)) return "Aujourd'hui";
  if (toDateKey(date) === toDateKey(tomorrow)) return "Demain";

  return new Intl.DateTimeFormat("fr-LU", { weekday: "long" }).format(date);
};

const formatAgendaDate = (date: Date) => {
  return new Intl.DateTimeFormat("fr-LU", {
    day: "2-digit",
    month: "long",
  }).format(date);
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
  const requestedDate = parseDateParam(getQueryString(req.query.date));
  const requestedDays = parseDaysParam(getQueryString(req.query.days));
  const includeDebug = getQueryString(req.query.debug) === "1";
  const selectedStart = requestedDate || startOfDay(now);
  const selectedEnd = addDays(selectedStart, 1);
  const endOfAgendaWindow = addDays(selectedStart, requestedDays);

  const [
    todayAppointments,
    agendaAppointments,
    upcomingAppointments,
    attentionRows,
    draftRows,
    readyRows,
    lastAppleConnection,
  ] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        entityId: cabinet.cabinetId,
        startsAt: {
          gte: selectedStart,
          lt: selectedEnd,
        },
      },
      select: appointmentSelect,
      orderBy: { startsAt: "asc" },
    }),
    prisma.appointment.findMany({
      where: {
        entityId: cabinet.cabinetId,
        startsAt: {
          gte: selectedStart,
          lt: endOfAgendaWindow,
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
    prisma.calendarConnection.findFirst({
      where: {
        entityId: cabinet.cabinetId,
        provider: "APPLE_CALENDAR",
        lastSyncedAt: {
          not: null,
        },
      },
      orderBy: {
        lastSyncedAt: "desc",
      },
      select: {
        lastSyncedAt: true,
      },
    }),
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
  const serializedAgendaAppointments = agendaAppointments.map(
    serializeAppointment
  );
  const serializedUpcomingAppointments = upcomingAppointments.map(
    serializeAppointment
  );
  const agendaAppointmentsByDate = serializedAgendaAppointments.reduce(
    (groups, appointment) => {
      const dateKey = toDateKey(new Date(appointment.startsAt));
      const currentAppointments = groups.get(dateKey) || [];
      currentAppointments.push(appointment);
      groups.set(dateKey, currentAppointments);
      return groups;
    },
    new Map<string, typeof serializedAgendaAppointments>()
  );
  const agendaDays = Array.from({ length: requestedDays }).map((_, index) => {
    const dayStart = addDays(selectedStart, index);
    const dateKey = toDateKey(dayStart);
    const appointments = agendaAppointmentsByDate.get(dateKey) || [];

    return {
      date: dateKey,
      dayLabel: dayLabel(dayStart),
      dateLabel: formatAgendaDate(dayStart),
      isToday: toDateKey(dayStart) === toDateKey(startOfDay(now)),
      appointments: sortAppointmentsByStart(appointments),
    };
  });
  const sessionsAlreadyCreatedToday = serializedTodayAppointments.filter(
    (appointment) => appointment.hasSession
  ).length;
  const appointmentsWithoutSessionToday =
    serializedTodayAppointments.length - sessionsAlreadyCreatedToday;

  return jsonSuccess(res, {
    cabinet: {
      cabinetId: cabinet.cabinetId,
      name: cabinet.cabinetName,
      lastAppleCalendarSync: lastAppleConnection?.lastSyncedAt?.toISOString() || null,
    },
    selectedDate: toDateKey(selectedStart),
    days: requestedDays,
    todayAppointments: serializedTodayAppointments,
    upcomingAppointments: serializedUpcomingAppointments,
    agendaDays,
    billingActions,
    summary: {
      appointmentsToday: serializedTodayAppointments.length,
      sessionsAlreadyCreatedToday,
      appointmentsWithoutSessionToday,
      invoicesToPrepare: draftPrescriptions.length,
      invoicesReady: readyPrescriptions.length,
    },
    ...(includeDebug
      ? {
          debug: {
            requestedDate: toDateKey(selectedStart),
            requestedDays,
            windowStart: selectedStart.toISOString(),
            windowEnd: endOfAgendaWindow.toISOString(),
            appointmentCount: serializedAgendaAppointments.length,
            agendaDayCounts: agendaDays.map((day) => ({
              date: day.date,
              count: day.appointments.length,
            })),
          },
        }
      : {}),
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
