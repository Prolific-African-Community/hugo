import type { NextApiResponse } from "next";
import { jsonError, jsonSuccess } from "../../../lib/accounting-api";
import { AuthenticatedNextApiRequest, withAuth } from "../../../lib/auth";
import { requireHugoCabinet } from "../../../lib/hugo-auth";
import { prisma } from "../../../lib/prisma";

const getDashboard = async (
  req: AuthenticatedNextApiRequest,
  res: NextApiResponse
) => {
  const cabinet = await requireHugoCabinet(req);

  if (!cabinet) {
    return jsonError(res, 404, "Cabinet not found");
  }

  const [patients, prescriptions, sessions] = await Promise.all([
    prisma.patient.findMany({
      where: { entityId: cabinet.cabinetId },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.prescription.findMany({
      where: { entityId: cabinet.cabinetId },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.therapySession.findMany({
      where: { entityId: cabinet.cabinetId },
      include: {
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
            status: true,
          },
        },
      },
      orderBy: { scheduledAt: "desc" },
    }),
  ]);

  const now = new Date();
  const activePrescriptions = prescriptions.filter(
    (prescription) => prescription.status === "ACTIVE"
  );
  const upcomingSessions = sessions.filter((session) => {
    if (session.status !== "PLANNED") return false;
    if (!session.scheduledAt) return true;
    return session.scheduledAt.getTime() >= now.getTime();
  });
  const almostDonePrescriptions = activePrescriptions.filter((prescription) => {
    const remaining =
      prescription.prescribedSessions - prescription.completedSessions;
    return remaining > 0 && remaining <= 2;
  });

  return jsonSuccess(res, {
    cabinet: {
      cabinetId: cabinet.cabinetId,
      name: cabinet.cabinetName,
      organizationId: cabinet.organizationId,
    },
    patients,
    prescriptions,
    sessions,
    metrics: {
      activePatients: patients.filter((patient) => patient.status === "ACTIVE")
        .length,
      activePrescriptions: activePrescriptions.length,
      upcomingSessions: upcomingSessions.length,
      almostDonePrescriptions: almostDonePrescriptions.length,
    },
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
