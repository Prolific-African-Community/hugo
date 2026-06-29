import {
  CalendarConnectionStatus,
  CalendarProvider,
  CalendarSyncActionStatus,
  CalendarSyncActionType,
} from "@prisma/client";
import type { NextApiRequest, NextApiResponse } from "next";
import { jsonSuccess } from "../../../lib/accounting-api";
import {
  CalendarPullSyncError,
  pullCalendarConnectionEvents,
} from "../../../lib/calendar-pull-sync";
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

    const pushResults = [];

    for (const action of actions) {
      const freshAction = await prisma.calendarSyncAction.findUnique({
        where: { id: action.id },
        select: {
          status: true,
        },
      });

      if (freshAction?.status !== CalendarSyncActionStatus.PENDING) {
        pushResults.push({
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

        pushResults.push({
          actionId: action.id,
          actionType: action.actionType,
          status: result.status,
          success: true,
          skipped: false,
          error: null,
        });
      } catch (error) {
        pushResults.push({
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

    const pushDoneCount = pushResults.filter((result) => result.success).length;
    const pushSkippedCount = pushResults.filter((result) => result.skipped).length;
    const pushFailedCount = pushResults.filter(
      (result) => !result.success && !result.skipped
    ).length;

    const connections = await prisma.calendarConnection.findMany({
      where: {
        provider: CalendarProvider.APPLE_CALENDAR,
        status: CalendarConnectionStatus.CONNECTED,
        calendarUrl: {
          not: "",
        },
      },
      orderBy: { updatedAt: "asc" },
      take: 20,
      select: {
        id: true,
        entityId: true,
        name: true,
      },
    });

    const pullResults = [];

    for (const connection of connections) {
      try {
        const result = await pullCalendarConnectionEvents({
          connectionId: connection.id,
          cabinetId: connection.entityId,
        });

        pullResults.push({
          connectionId: connection.id,
          name: connection.name,
          success: true,
          importedCount: result.importedCount,
          updatedCount: result.updatedCount,
          unmatchedCount: result.unmatchedCount,
          skippedCount: result.skippedCount,
          error: null,
        });
      } catch (error) {
        pullResults.push({
          connectionId: connection.id,
          name: connection.name,
          success: false,
          importedCount: 0,
          updatedCount: 0,
          unmatchedCount: 0,
          skippedCount: 0,
          error:
            error instanceof CalendarPullSyncError || error instanceof Error
              ? error.message
              : "Impossible de synchroniser Apple Calendar vers Hugo",
        });
      }
    }

    const pullSuccessCount = pullResults.filter((result) => result.success).length;
    const pullFailedCount = pullResults.filter((result) => !result.success).length;

    return jsonSuccess(res, {
      push: {
        processedCount: pushResults.length,
        doneCount: pushDoneCount,
        failedCount: pushFailedCount,
        skippedCount: pushSkippedCount,
        results: pushResults,
      },
      pull: {
        processedConnections: pullResults.length,
        successCount: pullSuccessCount,
        failedCount: pullFailedCount,
        results: pullResults,
      },
    });
  } catch (error) {
    console.error("HUGO CRON CALENDAR SYNC ERROR:", error);
    return readableError(res, 500, "Internal server error");
  }
}
