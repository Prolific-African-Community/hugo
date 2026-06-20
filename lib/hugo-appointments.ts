import { prisma } from "./prisma";

export const APPOINTMENT_OVERLAP_MESSAGE =
  "Un rendez-vous existe déjà sur cette plage horaire.";

export const DEFAULT_APPOINTMENT_DURATION_MINUTES = 45;

export function getDefaultAppointmentEnd(startsAt: Date) {
  return new Date(
    startsAt.getTime() + DEFAULT_APPOINTMENT_DURATION_MINUTES * 60_000
  );
}

export async function findAppointmentOverlap({
  cabinetId,
  startsAt,
  endsAt,
  excludeAppointmentId,
}: {
  cabinetId: string;
  startsAt: Date;
  endsAt: Date;
  excludeAppointmentId?: string | null;
}) {
  return prisma.appointment.findFirst({
    where: {
      entityId: cabinetId,
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt },
      ...(excludeAppointmentId ? { NOT: { id: excludeAppointmentId } } : {}),
    },
    select: {
      id: true,
    },
  });
}
