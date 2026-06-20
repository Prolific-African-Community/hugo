import {
  CalendarEventSyncStatus,
  CalendarProvider,
  CalendarSyncActionStatus,
  CalendarSyncActionType,
  CalendarWriteStatus,
} from "@prisma/client";
import type { NextApiResponse } from "next";
import {
  createCalDavEvent,
  decryptCalDavPassword,
  isReadOnlyAppleCalendarUrl,
  READ_ONLY_APPLE_CALENDAR_URL_MESSAGE,
} from "../../../../../lib/apple-caldav";
import { jsonSuccess } from "../../../../../lib/accounting-api";
import { AuthenticatedNextApiRequest, withAuth } from "../../../../../lib/auth";
import { requireHugoCabinet } from "../../../../../lib/hugo-auth";
import { prisma } from "../../../../../lib/prisma";

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

const getPayloadString = (payload: unknown, key: string) => {
  if (!payload || typeof payload !== "object") return null;

  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
};

const buildEventTitle = (action: {
  payload: unknown;
  appointment: {
    patient: {
      firstName: string;
      lastName: string;
    };
  } | null;
}) => {
  const payloadTitle = getPayloadString(action.payload, "title");

  if (payloadTitle) {
    return payloadTitle;
  }

  if (!action.appointment) {
    return "Rendez-vous Hugo";
  }

  const patientName = `${action.appointment.patient.firstName} ${action.appointment.patient.lastName}`.trim();
  return patientName ? `Rendez-vous - ${patientName}` : "Rendez-vous Hugo";
};

const pushCalendarSyncAction = async (
  req: AuthenticatedNextApiRequest,
  res: NextApiResponse
) => {
  const id = getRequiredActionId(req);
  const cabinet = await requireHugoCabinet(req);

  if (!id) {
    return readableError(res, 400, "Calendar sync action id is required");
  }

  if (!cabinet) {
    return readableError(res, 404, "Cabinet not found");
  }

  const action = await prisma.calendarSyncAction.findFirst({
    where: { id, entityId: cabinet.cabinetId },
    include: {
      mapping: true,
      calendarConnection: true,
      appointment: {
        include: {
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
  });

  if (!action) {
    return readableError(res, 404, "Calendar sync action not found");
  }

  if (
    action.status !== CalendarSyncActionStatus.PENDING &&
    action.status !== CalendarSyncActionStatus.FAILED
  ) {
    return readableError(res, 400, "Action must be PENDING or FAILED");
  }

  if (action.actionType !== CalendarSyncActionType.CREATE_EVENT) {
    return readableError(res, 400, "Action non supportée dans ce run.");
  }

  if (!action.appointment) {
    return readableError(res, 400, "Appointment linked to this action is missing");
  }

  if (!action.appointment.startsAt || !action.appointment.endsAt) {
    return readableError(res, 400, "Dates de rendez-vous manquantes.");
  }

  const connection =
    action.calendarConnection ||
    (await prisma.calendarConnection.findFirst({
      where: {
        entityId: cabinet.cabinetId,
        provider: CalendarProvider.APPLE_CALENDAR,
        writeStatus: CalendarWriteStatus.READY,
        writeEnabled: true,
      },
      orderBy: { updatedAt: "desc" },
    }));

  if (!connection) {
    return readableError(res, 400, "Aucune connexion Apple Calendar prête.");
  }

  if (
    connection.writeStatus !== CalendarWriteStatus.READY ||
    !connection.writeEnabled
  ) {
    return readableError(
      res,
      400,
      "L’écriture Apple Calendar n’est pas prête. Testez d’abord la connexion CalDAV."
    );
  }

  if (!connection.caldavUsername || !connection.caldavPasswordEncrypted) {
    return readableError(res, 400, "Configuration CalDAV incomplète.");
  }

  if (!connection.selectedCalendarUrl) {
    return readableError(
      res,
      400,
      "Aucun calendrier cible Apple Calendar sélectionné. Sélectionnez un calendrier cible avant de pousser l’événement."
    );
  }

  if (isReadOnlyAppleCalendarUrl(connection.selectedCalendarUrl)) {
    return readableError(res, 400, READ_ONLY_APPLE_CALENDAR_URL_MESSAGE);
  }

  await prisma.calendarSyncAction.update({
    where: { id: action.id },
    data: {
      status: CalendarSyncActionStatus.PROCESSING,
      error: null,
    },
  });

  try {
    const password = decryptCalDavPassword(connection.caldavPasswordEncrypted);
    const title = buildEventTitle(action);
    const description = getPayloadString(action.payload, "notes");
    const uid = action.mapping?.externalEventId || undefined;
    const result = await createCalDavEvent({
      selectedCalendarUrl: connection.selectedCalendarUrl,
      username: connection.caldavUsername,
      password,
      uid,
      title,
      startsAt: action.appointment.startsAt,
      endsAt: action.appointment.endsAt,
      description,
    });

    const mapping = await prisma.calendarEventMapping.upsert({
      where: { appointmentId: action.appointment.id },
      create: {
        entityId: cabinet.cabinetId,
        appointmentId: action.appointment.id,
        calendarConnectionId: connection.id,
        provider: CalendarProvider.APPLE_CALENDAR,
        externalEventId: result.externalEventId,
        externalCalendarId: result.externalCalendarUrl,
        externalEtag: result.etag,
        lastPushedAt: new Date(),
        syncStatus: CalendarEventSyncStatus.SYNCED,
        lastSyncError: null,
      },
      update: {
        calendarConnectionId: connection.id,
        provider: CalendarProvider.APPLE_CALENDAR,
        externalEventId: result.externalEventId,
        externalCalendarId: result.externalCalendarUrl,
        externalEtag: result.etag,
        lastPushedAt: new Date(),
        syncStatus: CalendarEventSyncStatus.SYNCED,
        lastSyncError: null,
      },
      select: {
        id: true,
        appointmentId: true,
        calendarConnectionId: true,
        provider: true,
        externalEventId: true,
        externalCalendarId: true,
        externalEtag: true,
        lastPushedAt: true,
        syncStatus: true,
      },
    });

    await prisma.calendarSyncAction.update({
      where: { id: action.id },
      data: {
        status: CalendarSyncActionStatus.DONE,
        mappingId: mapping.id,
        calendarConnectionId: connection.id,
        error: null,
        processedAt: new Date(),
      },
    });

    return jsonSuccess(res, {
      actionId: action.id,
      status: CalendarSyncActionStatus.DONE,
      mapping,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Impossible de pousser l'action vers Apple Calendar";

    await prisma.$transaction(async (tx) => {
      await tx.calendarSyncAction.update({
        where: { id: action.id },
        data: {
          status: CalendarSyncActionStatus.FAILED,
          error: message,
          processedAt: new Date(),
        },
      });

      if (action.mappingId) {
        await tx.calendarEventMapping.update({
          where: { id: action.mappingId },
          data: {
            syncStatus: CalendarEventSyncStatus.ERROR,
            lastSyncError: message,
          },
        });
      }
    });

    return readableError(res, 502, message);
  }
};

export default withAuth(
  async (req: AuthenticatedNextApiRequest, res: NextApiResponse) => {
    try {
      if (req.method === "POST") {
        return await pushCalendarSyncAction(req, res);
      }

      return readableError(res, 405, "Method not allowed");
    } catch (error) {
      console.error("HUGO CALENDAR ACTION PUSH ERROR:", error);
      return readableError(res, 500, "Internal server error");
    }
  }
);
