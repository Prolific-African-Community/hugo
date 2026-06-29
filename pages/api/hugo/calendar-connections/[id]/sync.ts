import type { NextApiResponse } from "next";
import { jsonError, jsonSuccess } from "../../../../../lib/accounting-api";
import { AuthenticatedNextApiRequest, withAuth } from "../../../../../lib/auth";
import {
  CalendarPullSyncError,
  pullCalendarConnectionEvents,
} from "../../../../../lib/calendar-pull-sync";
import { requireHugoCabinet } from "../../../../../lib/hugo-auth";

const getRequiredConnectionId = (req: AuthenticatedNextApiRequest) => {
  return typeof req.query.id === "string" && req.query.id.trim()
    ? req.query.id.trim()
    : null;
};

const syncCalendarConnection = async (
  req: AuthenticatedNextApiRequest,
  res: NextApiResponse
) => {
  const id = getRequiredConnectionId(req);
  const cabinet = await requireHugoCabinet(req);

  if (!id) {
    return jsonError(res, 400, "Calendar connection id is required");
  }

  if (!cabinet) {
    return jsonError(res, 404, "Cabinet not found");
  }

  try {
    const result = await pullCalendarConnectionEvents({
      connectionId: id,
      cabinetId: cabinet.cabinetId,
    });

    return jsonSuccess(res, result);
  } catch (error) {
    if (error instanceof CalendarPullSyncError) {
      return jsonError(res, error.statusCode, error.message);
    }

    console.error("HUGO CALENDAR CONNECTION SYNC ERROR:", error);
    return jsonError(res, 500, "Internal server error");
  }
};

export default withAuth(
  async (req: AuthenticatedNextApiRequest, res: NextApiResponse) => {
    if (req.method === "POST") {
      return await syncCalendarConnection(req, res);
    }

    return jsonError(res, 405, "Method not allowed");
  }
);
