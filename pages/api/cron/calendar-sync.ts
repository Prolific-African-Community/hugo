import {
  CalendarSyncActionStatus,
  CalendarSyncActionType,
} from "@prisma/client";
import type { NextApiRequest, NextApiResponse } from "next";
import { jsonSuccess } from "../../../lib/accounting-api";
import {
  CalendarSyncActionPushError,
  pushCalendarSyncAction,
} from "../../../lib/calendar-sync-actions";
import { prisma } from "../../../lib/prisma";

const readableError = (
  res: NextApiResponse,
  status: number,
  message: string
) => {
  return res.status(status).json({ success: false, message, error: message });
};

const isAuthorizedCronRequest = (req: NextApiRequest, secret: string) => {
  const authorization = req.headers.authorization;
  const querySecret =
    typeof req.query.secret === "string" ? req.query.secret : null;

  return authorization === `Bearer ${secret}` || querySecret === secret;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET" && req.method !== "POST") {
    return readableError(res, 405, "Method not allowed");
  }

  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return readableError(res, 500, "CRON_SECRET is not configured.");
  }

  if (!isAuthorizedCronRequest(req, cronSecret)) {
    return readableError(res, 401, "Unauthorized");
  }

  try {
    const actions = await prisma.calendarSyncAction.findMany({
      where: {
        status: CalendarSyncActionStatus.PENDING,
        actionType: {
          in: [
            CalendarSyncActionType.CREATE_EVENT,
            CalendarSyncActionType.UPDATE_EVENT,
            CalendarSyncActionType.DELETE_EVENT,
          ],
        },
      },
      orderBy: { createdAt: "asc" },
      take: 50,
      select: {
        id: true,
        entityId: true,
        actionType: true,
      },
    });

    const results = [];

    for (const action of actions) {
      const freshAction = await prisma.calendarSyncAction.findUnique({
        where: { id: action.id },
        select: {
          status: true,
        },
      });

      if (freshAction?.status !== CalendarSyncActionStatus.PENDING) {
        results.push({
          actionId: action.id,
          actionType: action.actionType,
          status: freshAction?.status || "MISSING",
          success: false,
          skipped: true,
          error: "Action déjà traitée ou en cours.",
        });
        continue;
      }

      try {
        const result = await pushCalendarSyncAction(action.id, action.entityId);

        results.push({
          actionId: action.id,
          actionType: action.actionType,
          status: result.status,
          success: true,
          skipped: false,
          error: null,
        });
      } catch (error) {
        results.push({
          actionId: action.id,
          actionType: action.actionType,
          status: CalendarSyncActionStatus.FAILED,
          success: false,
          skipped: false,
          error:
            error instanceof CalendarSyncActionPushError ||
            error instanceof Error
              ? error.message
              : "Impossible de pousser l'action vers Apple Calendar",
        });
      }
    }

    const doneCount = results.filter((result) => result.success).length;
    const skippedCount = results.filter((result) => result.skipped).length;
    const failedCount = results.filter(
      (result) => !result.success && !result.skipped
    ).length;

    return jsonSuccess(res, {
      processedCount: results.length,
      doneCount,
      failedCount,
      skippedCount,
      results,
    });
  } catch (error) {
    console.error("HUGO CRON CALENDAR SYNC ERROR:", error);
    return readableError(res, 500, "Internal server error");
  }
}
