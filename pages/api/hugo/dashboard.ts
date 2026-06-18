import type { NextApiResponse } from "next";
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

const sessionSelect = {
  id: true,
  sessionNumber: true,
  scheduledAt: true,
  completedAt: true,
  status: true,
  patient: {
    select: patientSelect,
  },
  prescription: {
    select: prescriptionSelect,
  },
};

const getDashboard = async (
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
    activePatientsCount,
    activePrescriptionsCount,
    upcomingSessionsCount,
    todaySessions,
    upcomingSessions,
    activePrescriptionSummaries,
    recentPatients,
  ] = await Promise.all([
    prisma.patient.count({
      where: { entityId: cabinet.cabinetId, status: "ACTIVE" },
    }),
    prisma.prescription.count({
      where: { entityId: cabinet.cabinetId, status: "ACTIVE" },
    }),
    prisma.therapySession.count({
      where: {
        entityId: cabinet.cabinetId,
        status: "PLANNED",
        scheduledAt: { gte: now },
      },
    }),
    prisma.therapySession.findMany({
      where: {
        entityId: cabinet.cabinetId,
        status: "PLANNED",
        scheduledAt: {
          gte: startOfToday,
          lt: endOfToday,
        },
      },
      select: sessionSelect,
      orderBy: { scheduledAt: "asc" },
      take: 5,
    }),
    prisma.therapySession.findMany({
      where: {
        entityId: cabinet.cabinetId,
        status: "PLANNED",
        scheduledAt: { gte: now },
      },
      select: sessionSelect,
      orderBy: { scheduledAt: "asc" },
      take: 5,
    }),
    prisma.prescription.findMany({
      where: { entityId: cabinet.cabinetId, status: "ACTIVE" },
      select: {
        ...prescriptionSelect,
        patient: {
          select: patientSelect,
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.patient.findMany({
      where: { entityId: cabinet.cabinetId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        status: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),
  ]);

  const nearlyCompletedPrescriptionSummaries = activePrescriptionSummaries.filter(
    (prescription) => {
      const remaining =
        prescription.prescribedSessions - prescription.completedSessions;
      return remaining > 0 && remaining <= 2;
    }
  );
  const nearlyCompletedPrescriptions =
    nearlyCompletedPrescriptionSummaries.slice(0, 5);

  return jsonSuccess(res, {
    cabinet: {
      cabinetId: cabinet.cabinetId,
      name: cabinet.cabinetName,
    },
    metrics: {
      activePatientsCount,
      activePrescriptionsCount,
      upcomingSessionsCount,
      nearlyCompletedPrescriptionsCount:
        nearlyCompletedPrescriptionSummaries.length,
    },
    todaySessions,
    upcomingSessions,
    nearlyCompletedPrescriptions,
    recentPatients,
  });
};

export default withAuth(
  async (req: AuthenticatedNextApiRequest, res: NextApiResponse) => {
    try {
      if (req.method === "GET") {
        return await getDashboard(req, res);
      }

      return jsonError(res, 405, "Method not allowed");
    } catch (error) {
      console.error("HUGO DASHBOARD ERROR:", error);
      return jsonError(res, 500, "Internal server error");
    }
  }
);
