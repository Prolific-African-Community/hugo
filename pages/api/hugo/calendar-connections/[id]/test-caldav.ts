import { CalendarWriteStatus, Prisma } from "@prisma/client";
import type { NextApiResponse } from "next";
import {
  discoverCalendars,
  encryptCalDavPassword,
  isWritableCalendarTargetUrl,
  normalizeCalDavUrl,
  READ_ONLY_APPLE_CALENDAR_URL_MESSAGE,
  testCalDavConnection,
} from "../../../../../lib/apple-caldav";
import { jsonError, jsonSuccess } from "../../../../../lib/accounting-api";
import { AuthenticatedNextApiRequest, withAuth } from "../../../../../lib/auth";
import { requireHugoCabinet } from "../../../../../lib/hugo-auth";
import { prisma } from "../../../../../lib/prisma";

interface TestCalDavBody {
  caldavUrl?: unknown;
  username?: unknown;
  password?: unknown;
}

const getRequiredConnectionId = (req: AuthenticatedNextApiRequest) => {
  return typeof req.query.id === "string" && req.query.id.trim()
    ? req.query.id.trim()
    : null;
};

const getRequiredString = (value: unknown) => {
  return typeof value === "string" && value.trim() ? value.trim() : null;
};

const testCalDav = async (
  req: AuthenticatedNextApiRequest,
  res: NextApiResponse
) => {
  const id = getRequiredConnectionId(req);
  const cabinet = await requireHugoCabinet(req);
  const body = req.body as TestCalDavBody;
  const rawUrl = getRequiredString(body.caldavUrl);
  const username = getRequiredString(body.username);
  const password = getRequiredString(body.password);

  if (!id) {
    return jsonError(res, 400, "Calendar connection id is required");
  }

  if (!cabinet) {
    return jsonError(res, 404, "Cabinet not found");
  }

  const connection = await prisma.calendarConnection.findFirst({
    where: { id, entityId: cabinet.cabinetId },
    select: {
      id: true,
      selectedCalendarUrl: true,
      selectedCalendarName: true,
    },
  });

  if (!connection) {
    return jsonError(res, 404, "Calendar connection not found");
  }

  if (!rawUrl || !username || !password) {
    return jsonError(
      res,
      400,
      "caldavUrl, username and password are required"
    );
  }

  let normalizedUrl: string;
  try {
    normalizedUrl = normalizeCalDavUrl(rawUrl);
    await testCalDavConnection({
      caldavUrl: normalizedUrl,
      username,
      password,
    });
    const calendars = await discoverCalendars({
      caldavUrl: normalizedUrl,
      username,
      password,
    });

    const capabilities = {
      calendars: calendars.map((calendar) => ({
        name: calendar.name,
        url: calendar.url,
        color: calendar.color || null,
        writable: calendar.writable,
      })),
      calendarCount: calendars.length,
      testedAt: new Date().toISOString(),
    } as Prisma.InputJsonValue;

    const updatedConnection = await prisma.calendarConnection.update({
      where: { id },
      data: {
        writeEnabled: true,
        caldavUrl: normalizedUrl,
        caldavUsername: username,
        caldavPasswordEncrypted: encryptCalDavPassword(password),
        capabilities,
        writeStatus: CalendarWriteStatus.READY,
        lastWriteTestAt: new Date(),
        writeLastError: calendars.length
          ? null
          : "Connexion prête, mais aucun calendrier écrivable détecté automatiquement.",
      },
      select: {
        id: true,
        writeEnabled: true,
        writeStatus: true,
        lastWriteTestAt: true,
        writeLastError: true,
        selectedCalendarUrl: true,
        selectedCalendarName: true,
        capabilities: true,
      },
    });

    const targetCalendarInvalid = Boolean(
      updatedConnection.selectedCalendarUrl &&
        !isWritableCalendarTargetUrl(updatedConnection.selectedCalendarUrl)
    );

    return jsonSuccess(res, {
      writeStatus: updatedConnection.writeStatus,
      writeEnabled: updatedConnection.writeEnabled,
      lastWriteTestAt: updatedConnection.lastWriteTestAt,
      selectedCalendarUrl: targetCalendarInvalid
        ? null
        : updatedConnection.selectedCalendarUrl,
      selectedCalendarName: targetCalendarInvalid
        ? null
        : updatedConnection.selectedCalendarName,
      targetCalendarInvalid,
      targetCalendarError: targetCalendarInvalid
        ? READ_ONLY_APPLE_CALENDAR_URL_MESSAGE
        : null,
      writeLastError: updatedConnection.writeLastError,
      calendars,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Connexion CalDAV impossible";

    await prisma.calendarConnection.update({
      where: { id },
      data: {
        writeStatus: CalendarWriteStatus.ERROR,
        writeLastError: message,
        lastWriteTestAt: new Date(),
      },
    });

    return jsonError(res, 400, message);
  }
};

export default withAuth(
  async (req: AuthenticatedNextApiRequest, res: NextApiResponse) => {
    try {
      if (req.method === "POST") {
        return await testCalDav(req, res);
      }

      return jsonError(res, 405, "Method not allowed");
    } catch (error) {
      console.error("HUGO CALDAV TEST ERROR:", error);
      return jsonError(res, 500, "Internal server error");
    }
  }
);
