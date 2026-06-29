import {
  CalendarConnectionStatus,
  CalendarProvider,
  CalendarSyncActionStatus,
} from "@prisma/client";
import type { NextApiResponse } from "next";
import {
  isWritableCalendarTargetUrl,
  READ_ONLY_APPLE_CALENDAR_URL_MESSAGE,
} from "../../../../lib/apple-caldav";
import { jsonError, jsonSuccess } from "../../../../lib/accounting-api";
import { AuthenticatedNextApiRequest, withAuth } from "../../../../lib/auth";
import { requireHugoCabinet } from "../../../../lib/hugo-auth";
import { prisma } from "../../../../lib/prisma";

interface CalendarConnectionBody {
  name?: unknown;
  calendarUrl?: unknown;
}

const calendarConnectionSelect = {
  id: true,
  entityId: true,
  provider: true,
  name: true,
  calendarUrl: true,
  status: true,
  writeEnabled: true,
  caldavUrl: true,
  caldavUsername: true,
  selectedCalendarUrl: true,
  selectedCalendarName: true,
  capabilities: true,
  lastWriteTestAt: true,
  writeStatus: true,
  writeLastError: true,
  lastSyncedAt: true,
  lastError: true,
  createdAt: true,
  updatedAt: true,
  syncActions: {
    where: {
      status: {
        in: [
          CalendarSyncActionStatus.PENDING,
          CalendarSyncActionStatus.FAILED,
        ],
      },
    },
    orderBy: {
      createdAt: "desc" as const,
    },
    take: 20,
    select: {
      id: true,
      actionType: true,
      status: true,
      error: true,
      createdAt: true,
      payload: true,
      appointment: {
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          patient: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      },
    },
  },
};

const serializeCalendarConnection = <
  T extends {
    selectedCalendarUrl: string | null;
    selectedCalendarName: string | null;
  }
>(
  connection: T
) => {
  const targetCalendarInvalid = Boolean(
    connection.selectedCalendarUrl &&
      !isWritableCalendarTargetUrl(connection.selectedCalendarUrl)
  );

  return {
    ...connection,
    selectedCalendarUrl: targetCalendarInvalid
      ? null
      : connection.selectedCalendarUrl,
    selectedCalendarName: targetCalendarInvalid
      ? null
      : connection.selectedCalendarName,
    targetCalendarInvalid,
    targetCalendarError: targetCalendarInvalid
      ? READ_ONLY_APPLE_CALENDAR_URL_MESSAGE
      : null,
  };
};

const getRequiredString = (value: unknown) => {
  return typeof value === "string" && value.trim() ? value.trim() : null;
};

const validateCalendarUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "webcal:";
  } catch {
    return false;
  }
};

const listCalendarConnections = async (
  req: AuthenticatedNextApiRequest,
  res: NextApiResponse
) => {
  const cabinet = await requireHugoCabinet(req);

  if (!cabinet) {
    return jsonError(res, 404, "Cabinet not found");
  }

  const connections = await prisma.calendarConnection.findMany({
    where: { entityId: cabinet.cabinetId },
    select: calendarConnectionSelect,
    orderBy: { updatedAt: "desc" },
  });

  return jsonSuccess(res, connections.map(serializeCalendarConnection));
};

const createCalendarConnection = async (
  req: AuthenticatedNextApiRequest,
  res: NextApiResponse
) => {
  const cabinet = await requireHugoCabinet(req);

  if (!cabinet) {
    return jsonError(res, 404, "Cabinet not found");
  }

  const body = req.body as CalendarConnectionBody;
  const name = getRequiredString(body.name) || "Apple Calendar";
  const calendarUrl = getRequiredString(body.calendarUrl);

  if (!calendarUrl) {
    return jsonError(res, 400, "calendarUrl is required");
  }

  if (!validateCalendarUrl(calendarUrl)) {
    return jsonError(res, 400, "calendarUrl must be a valid https or webcal URL");
  }

  const connection = await prisma.calendarConnection.create({
    data: {
      entityId: cabinet.cabinetId,
      provider: CalendarProvider.APPLE_CALENDAR,
      name,
      calendarUrl,
      status: CalendarConnectionStatus.CONNECTED,
    },
    select: calendarConnectionSelect,
  });

  return jsonSuccess(res, serializeCalendarConnection(connection), 201);
};

export default withAuth(
  async (req: AuthenticatedNextApiRequest, res: NextApiResponse) => {
    try {
      if (req.method === "GET") {
        return await listCalendarConnections(req, res);
      }

      if (req.method === "POST") {
        return await createCalendarConnection(req, res);
      }

      return jsonError(res, 405, "Method not allowed");
    } catch (error) {
      console.error("HUGO CALENDAR CONNECTIONS ERROR:", error);
      return jsonError(res, 500, "Internal server error");
    }
  }
);
