import {
  CalendarSyncActionStatus,
  CalendarSyncActionType,
} from "@prisma/client";
import type { NextApiResponse } from "next";
import { jsonSuccess } from "../../../../lib/accounting-api";
import { AuthenticatedNextApiRequest, withAuth } from "../../../../lib/auth";
import {
  CalendarSyncActionPushError,
  pushCalendarSyncAction,
} from "../../../../lib/calendar-sync-actions";
import { requireHugoCabinet } from "../../../../lib/hugo-auth";
import { prisma } from "../../../../lib/prisma";

const readableError = (
  res: NextApiResponse,
  status: number,
  message: string
) => {
  return res.status(status).json({ success: false, message, error: message });
};

export default withAuth(
  async (req: AuthenticatedNextApiRequest, res: NextApiResponse) => {
    if (req.method !== "POST") {
      return readableError(res, 405, "Method not allowed");
    }

    try {
      const cabinet = await requireHugoCabinet(req);

      if (!cabinet) {
        return readableError(res, 404, "Cabinet not found");
      }

      const actions = await prisma.calendarSyncAction.findMany({
        where: {
          entityId: cabinet.cabinetId,
          status: {
            in: [
              CalendarSyncActionStatus.PENDING,
              CalendarSyncActionStatus.FAILED,
            ],
          },
          actionType: {
            in: [
              CalendarSyncActionType.CREATE_EVENT,
              CalendarSyncActionType.UPDATE_EVENT,
              CalendarSyncActionType.DELETE_EVENT,
            ],
          },
        },
        orderBy: { createdAt: "asc" },
        take: 20,
        select: {
          id: true,
          actionType: true,
        },
      });

      const results = [];

      for (const action of actions) {
        try {
          const result = await pushCalendarSyncAction(
            action.id,
            cabinet.cabinetId
          );

          results.push({
            actionId: action.id,
            actionType: action.actionType,
            status: result.status,
            success: true,
            error: null,
          });
        } catch (error) {
          results.push({
            actionId: action.id,
            actionType: action.actionType,
            status: CalendarSyncActionStatus.FAILED,
            success: false,
            error:
              error instanceof CalendarSyncActionPushError ||
              error instanceof Error
                ? error.message
                : "Impossible de pousser l'action vers Apple Calendar",
          });
        }
      }

      const doneCount = results.filter((result) => result.success).length;
      const failedCount = results.filter((result) => !result.success).length;

      return jsonSuccess(res, {
        processedCount: results.length,
        doneCount,
        failedCount,
        skippedCount: 0,
        results,
      });
    } catch (error) {
      console.error("HUGO CALENDAR PENDING ACTIONS PUSH ERROR:", error);
      return readableError(res, 500, "Internal server error");
    }
  }
);
