import type { NextApiResponse } from "next";
import { jsonSuccess } from "../../../../../lib/accounting-api";
import { AuthenticatedNextApiRequest, withAuth } from "../../../../../lib/auth";
import {
  CalendarSyncActionPushError,
  pushCalendarSyncAction,
} from "../../../../../lib/calendar-sync-actions";
import { requireHugoCabinet } from "../../../../../lib/hugo-auth";

const readableError = (
  res: NextApiResponse,
  status: number,
  message: string
) => {
  return res.status(status).json({ success: false, message, error: message });
};

const getRequiredActionId = (req: AuthenticatedNextApiRequest) => {
  return typeof req.query.id === "string" && req.query.id.trim()
    ? req.query.id.trim()
    : null;
};

export default withAuth(
  async (req: AuthenticatedNextApiRequest, res: NextApiResponse) => {
    if (req.method !== "POST") {
      return readableError(res, 405, "Method not allowed");
    }

    try {
      const id = getRequiredActionId(req);
      const cabinet = await requireHugoCabinet(req);

      if (!id) {
        return readableError(res, 400, "Calendar sync action id is required");
      }

      if (!cabinet) {
        return readableError(res, 404, "Cabinet not found");
      }

      const result = await pushCalendarSyncAction(id, cabinet.cabinetId);
      return jsonSuccess(res, result);
    } catch (error) {
      if (error instanceof CalendarSyncActionPushError) {
        return readableError(res, error.statusCode, error.message);
      }

      console.error("HUGO CALENDAR ACTION PUSH ERROR:", error);
      return readableError(res, 500, "Internal server error");
    }
  }
);
