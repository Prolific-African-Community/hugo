import type { NextApiResponse } from "next";
import {
  getQueryString,
  jsonError,
  jsonSuccess,
} from "../../../../lib/accounting-api";
import { AuthenticatedNextApiRequest, withAuth } from "../../../../lib/auth";
import { requireHugoCabinet } from "../../../../lib/hugo-auth";
import { prisma } from "../../../../lib/prisma";

const DEFAULT_DURATION_MINUTES = 45;
const DEFAULT_DAYS = 7;
const DEFAULT_START_HOUR = 8;
const DEFAULT_END_HOUR = 19;
const SLOT_GRANULARITY_MINUTES = 15;
const MAX_SUGGESTIONS = 20;

const parsePositiveInteger = (
  value: string | null,
  fallback: number,
  min: number,
  max: number
) => {
  if (!value) return fallback;

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max
    ? parsed
    : fallback;
};

const parseDateOnly = (value: string | null) => {
  if (!value) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  }

  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3])
  );
  date.setHours(0, 0, 0, 0);

  return Number.isNaN(date.getTime()) ? null : date;
};

const addMinutes = (date: Date, minutes: number) => {
  return new Date(date.getTime() + minutes * 60_000);
};

const overlaps = (
  slotStart: Date,
  slotEnd: Date,
  appointment: { startsAt: Date; endsAt: Date }
) => appointment.startsAt < slotEnd && appointment.endsAt > slotStart;

const formatLabel = (startsAt: Date, endsAt: Date) => {
  const day = new Intl.DateTimeFormat("fr-LU", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  }).format(startsAt);
  const time = new Intl.DateTimeFormat("fr-LU", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return `${day} · ${time.format(startsAt)} - ${time.format(endsAt)}`;
};

const formatDayLabel = (date: Date) => {
  return new Intl.DateTimeFormat("fr-LU", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(date);
};

const isSameDay = (left: Date, right: Date) => {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
};

const scoreSlot = (startsAt: Date, baseDate: Date) => {
  let score = 50;
  const dayOffset = Math.floor(
    (new Date(startsAt).setHours(0, 0, 0, 0) - baseDate.getTime()) /
      86_400_000
  );
  const hour = startsAt.getHours() + startsAt.getMinutes() / 60;

  if (dayOffset === 0) score += 25;
  if (dayOffset === 1) score += 20;
  if (dayOffset >= 2) score += Math.max(0, 14 - dayOffset * 2);

  if (hour >= 9 && hour < 17) score += 20;
  if (hour < 9 || hour >= 18) score -= 10;

  return score;
};

const suggestAvailability = async (
  req: AuthenticatedNextApiRequest,
  res: NextApiResponse
) => {
  const cabinet = await requireHugoCabinet(req);

  if (!cabinet) {
    return jsonError(res, 404, "Cabinet not found");
  }

  const baseDate = parseDateOnly(getQueryString(req.query.date));

  if (!baseDate) {
    return jsonError(res, 400, "date must use YYYY-MM-DD format");
  }

  const durationMinutes = parsePositiveInteger(
    getQueryString(req.query.durationMinutes),
    DEFAULT_DURATION_MINUTES,
    15,
    240
  );
  const days = parsePositiveInteger(
    getQueryString(req.query.days),
    DEFAULT_DAYS,
    1,
    30
  );
  const preferredStartHour = parsePositiveInteger(
    getQueryString(req.query.preferredStartHour),
    DEFAULT_START_HOUR,
    0,
    23
  );
  const preferredEndHour = parsePositiveInteger(
    getQueryString(req.query.preferredEndHour),
    DEFAULT_END_HOUR,
    1,
    24
  );

  if (preferredEndHour <= preferredStartHour) {
    return jsonError(
      res,
      400,
      "preferredEndHour must be after preferredStartHour"
    );
  }

  const periodEnd = new Date(baseDate);
  periodEnd.setDate(periodEnd.getDate() + days);

  const appointments = await prisma.appointment.findMany({
    where: {
      entityId: cabinet.cabinetId,
      startsAt: { lt: periodEnd },
      endsAt: { gt: baseDate },
    },
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
    },
    orderBy: { startsAt: "asc" },
  });

  const suggestions = [];
  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  for (let dayIndex = 0; dayIndex < days; dayIndex += 1) {
    const dayStart = new Date(baseDate);
    dayStart.setDate(baseDate.getDate() + dayIndex);
    dayStart.setHours(preferredStartHour, 0, 0, 0);

    const dayEnd = new Date(baseDate);
    dayEnd.setDate(baseDate.getDate() + dayIndex);
    dayEnd.setHours(preferredEndHour, 0, 0, 0);

    for (
      let startsAt = new Date(dayStart);
      addMinutes(startsAt, durationMinutes) <= dayEnd;
      startsAt = addMinutes(startsAt, SLOT_GRANULARITY_MINUTES)
    ) {
      const endsAt = addMinutes(startsAt, durationMinutes);

      if (startsAt < now) continue;

      const hasOverlap = appointments.some((appointment) =>
        overlaps(startsAt, endsAt, appointment)
      );

      if (hasOverlap) continue;

      suggestions.push({
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        label: formatLabel(startsAt, endsAt),
        dayLabel: formatDayLabel(startsAt),
        isToday: isSameDay(startsAt, today),
        score: scoreSlot(startsAt, baseDate),
      });
    }
  }

  suggestions.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    return new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime();
  });

  return jsonSuccess(res, suggestions.slice(0, MAX_SUGGESTIONS));
};

export default withAuth(
  async (req: AuthenticatedNextApiRequest, res: NextApiResponse) => {
    try {
      if (req.method === "GET") {
        return await suggestAvailability(req, res);
      }

      return jsonError(res, 405, "Method not allowed");
    } catch (error) {
      console.error("HUGO AVAILABILITY SUGGEST ERROR:", error);
      return jsonError(res, 500, "Internal server error");
    }
  }
);
