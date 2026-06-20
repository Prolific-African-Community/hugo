import { CalendarConnectionStatus, CalendarWriteStatus } from "@prisma/client";
import type { NextApiResponse } from "next";
import { jsonError, jsonSuccess } from "../../../../../lib/accounting-api";
import { AuthenticatedNextApiRequest, withAuth } from "../../../../../lib/auth";
import { requireHugoCabinet } from "../../../../../lib/hugo-auth";
import { prisma } from "../../../../../lib/prisma";

interface CalendarConnectionUpdateBody {
  name?: unknown;
  calendarUrl?: unknown;
  status?: unknown;
  selectedCalendarUrl?: unknown;
  selectedCalendarName?: unknown;
  writeEnabled?: unknown;
  writeStatus?: unknown;
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
};

const getRequiredConnectionId = (req: AuthenticatedNextApiRequest) => {
  return typeof req.query.id === "string" && req.query.id.trim()
    ? req.query.id.trim()
    : null;
};

const getOptionalString = (value: unknown) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const parseConnectionStatus = (
  value: unknown
): CalendarConnectionStatus | undefined | null => {
  if (value === undefined) return undefined;

  return typeof value === "string" &&
    Object.values(CalendarConnectionStatus).includes(
      value as CalendarConnectionStatus
    )
    ? (value as CalendarConnectionStatus)
    : null;
};

const parseWriteStatus = (
  value: unknown
): CalendarWriteStatus | undefined | null => {
  if (value === undefined) return undefined;

  return typeof value === "string" &&
    Object.values(CalendarWriteStatus).includes(value as CalendarWriteStatus)
    ? (value as CalendarWriteStatus)
    : null;
};

const parseOptionalBoolean = (value: unknown) => {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") return null;
  return value;
};

const validateCalendarUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "webcal:";
  } catch {
    return false;
  }
};

const updateCalendarConnection = async (
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

  const existingConnection = await prisma.calendarConnection.findFirst({
    where: { id, entityId: cabinet.cabinetId },
    select: { id: true },
  });

  if (!existingConnection) {
    return jsonError(res, 404, "Calendar connection not found");
  }

  const body = req.body as CalendarConnectionUpdateBody;
  const name = getOptionalString(body.name);
  const calendarUrl = getOptionalString(body.calendarUrl);
  const selectedCalendarUrl = getOptionalString(body.selectedCalendarUrl);
  const selectedCalendarName = getOptionalString(body.selectedCalendarName);
  const writeEnabled = parseOptionalBoolean(body.writeEnabled);
  const status = parseConnectionStatus(body.status);
  const writeStatus = parseWriteStatus(body.writeStatus);

  if (name === null) {
    return jsonError(res, 400, "name cannot be empty");
  }

  if (calendarUrl === null) {
    return jsonError(res, 400, "calendarUrl cannot be empty");
  }

  if (selectedCalendarUrl === null) {
    return jsonError(res, 400, "selectedCalendarUrl cannot be empty");
  }

  if (selectedCalendarName === null) {
    return jsonError(res, 400, "selectedCalendarName cannot be empty");
  }

  if (calendarUrl && !validateCalendarUrl(calendarUrl)) {
    return jsonError(res, 400, "calendarUrl must be a valid https or webcal URL");
  }

  if (status === null) {
    return jsonError(res, 400, "A valid status is required");
  }

  if (writeEnabled === null) {
    return jsonError(res, 400, "writeEnabled must be a boolean");
  }

  if (writeStatus === null) {
    return jsonError(res, 400, "A valid writeStatus is required");
  }

  if (selectedCalendarUrl && !validateCalendarUrl(selectedCalendarUrl)) {
    return jsonError(
      res,
      400,
      "selectedCalendarUrl must be a valid https or webcal URL"
    );
  }

  const shouldDisableWrite =
    writeEnabled === false || writeStatus === CalendarWriteStatus.DISABLED;

  const connection = await prisma.calendarConnection.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(calendarUrl !== undefined ? { calendarUrl } : {}),
      ...(selectedCalendarUrl !== undefined ? { selectedCalendarUrl } : {}),
      ...(selectedCalendarName !== undefined ? { selectedCalendarName } : {}),
      ...(writeEnabled !== undefined ? { writeEnabled } : {}),
      ...(writeStatus !== undefined ? { writeStatus } : {}),
      ...(shouldDisableWrite
        ? { writeEnabled: false, writeStatus: CalendarWriteStatus.DISABLED }
        : {}),
      ...(writeStatus !== undefined && writeStatus !== "ERROR"
        ? { writeLastError: null }
        : {}),
      ...(status !== undefined ? { status } : {}),
      ...(status !== undefined && status !== "ERROR" ? { lastError: null } : {}),
    },
    select: calendarConnectionSelect,
  });

  return jsonSuccess(res, connection);
};

const deleteCalendarConnection = async (
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

  const existingConnection = await prisma.calendarConnection.findFirst({
    where: { id, entityId: cabinet.cabinetId },
    select: { id: true },
  });

  if (!existingConnection) {
    return jsonError(res, 404, "Calendar connection not found");
  }

  await prisma.calendarConnection.delete({ where: { id } });

  return jsonSuccess(res, { id });
};

export default withAuth(
  async (req: AuthenticatedNextApiRequest, res: NextApiResponse) => {
    try {
      if (req.method === "PATCH") {
        return await updateCalendarConnection(req, res);
      }

      if (req.method === "DELETE") {
        return await deleteCalendarConnection(req, res);
      }

      return jsonError(res, 405, "Method not allowed");
    } catch (error) {
      console.error("HUGO CALENDAR CONNECTION ERROR:", error);
      return jsonError(res, 500, "Internal server error");
    }
  }
);
