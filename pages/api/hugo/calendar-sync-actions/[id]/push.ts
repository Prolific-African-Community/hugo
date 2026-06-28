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
  deleteCalDavEvent,
  decryptCalDavPassword,
  isWritableCalendarTargetUrl,
  READ_ONLY_APPLE_CALENDAR_URL_MESSAGE,
  updateCalDavEvent,
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

  if (
    action.actionType !== CalendarSyncActionType.CREATE_EVENT &&
    action.actionType !== CalendarSyncActionType.UPDATE_EVENT &&
    action.actionType !== CalendarSyncActionType.DELETE_EVENT
  ) {
    return readableError(res, 400, "Action non supportée dans ce run.");
  }

  if (action.actionType !== CalendarSyncActionType.DELETE_EVENT && !action.appointment) {
    return readableError(res, 400, "Appointment linked to this action is missing");
  }

  if (
    action.actionType !== CalendarSyncActionType.DELETE_EVENT &&
    (!action.appointment?.startsAt || !action.appointment.endsAt)
  ) {
    return readableError(res, 400, "Dates de rendez-vous manquantes.");
  }

  const appointment = action.appointment;
  const payloadExternalEventId = getPayloadString(
    action.payload,
    "externalEventId"
  );

  const mapping =
    action.mapping ||
    (appointment
      ? await prisma.calendarEventMapping.findUnique({
          where: { appointmentId: appointment.id },
        })
      : null);

  const connection =
    action.calendarConnection ||
    (mapping?.calendarConnectionId
      ? await prisma.calendarConnection.findFirst({
          where: {
            id: mapping.calendarConnectionId,
            entityId: cabinet.cabinetId,
          },
        })
      : null) ||
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

  if (!isWritableCalendarTargetUrl(connection.selectedCalendarUrl)) {
    return readableError(res, 400, READ_ONLY_APPLE_CALENDAR_URL_MESSAGE);
  }

  const selectedCalendarUrl = connection.selectedCalendarUrl;
  const caldavUsername = connection.caldavUsername;

  if (action.actionType === CalendarSyncActionType.UPDATE_EVENT) {
    if (!mapping) {
      return readableError(
        res,
        400,
        "Mapping Apple Calendar introuvable pour ce rendez-vous."
      );
    }

    if (!mapping.externalEventId) {
      return readableError(res, 400, "UID Apple Calendar manquant.");
    }
  }

  if (action.actionType === CalendarSyncActionType.DELETE_EVENT) {
    const externalEventId = mapping?.externalEventId || payloadExternalEventId;

    if (!externalEventId) {
      return readableError(res, 400, "UID Apple Calendar manquant.");
    }
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
    const pushedMapping =
      action.actionType === CalendarSyncActionType.CREATE_EVENT
        ? await (async () => {
            if (!appointment) {
              throw new Error("Appointment linked to this action is missing");
            }

            const result = await createCalDavEvent({
              selectedCalendarUrl,
              username: caldavUsername,
              password,
              uid: mapping?.externalEventId || undefined,
              title,
              startsAt: appointment.startsAt,
              endsAt: appointment.endsAt,
              description,
            });

            return prisma.calendarEventMapping.upsert({
              where: { appointmentId: appointment.id },
              create: {
                entityId: cabinet.cabinetId,
                appointmentId: appointment.id,
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
          })()
        : action.actionType === CalendarSyncActionType.UPDATE_EVENT
          ? await (async () => {
            if (!appointment) {
              throw new Error("Appointment linked to this action is missing");
            }

            if (!mapping) {
              throw new Error("Mapping Apple Calendar introuvable pour ce rendez-vous.");
            }

            const result = await updateCalDavEvent({
              selectedCalendarUrl,
              username: caldavUsername,
              password,
              externalEventId: mapping.externalEventId,
              title,
              startsAt: appointment.startsAt,
              endsAt: appointment.endsAt,
              description,
              etag: mapping.externalEtag,
            });

            return prisma.calendarEventMapping.update({
              where: { id: mapping.id },
              data: {
                calendarConnectionId: connection.id,
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
          })()
          : await (async () => {
              const externalEventId =
                mapping?.externalEventId || payloadExternalEventId;

              if (!externalEventId) {
                throw new Error("UID Apple Calendar manquant.");
              }

              const result = await deleteCalDavEvent({
                selectedCalendarUrl,
                username: caldavUsername,
                password,
                externalEventId,
                etag: mapping?.externalEtag || getPayloadString(action.payload, "etag"),
              });

              if (!mapping) {
                return null;
              }

              return prisma.calendarEventMapping.update({
                where: { id: mapping.id },
                data: {
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
            })();

    await prisma.calendarSyncAction.update({
      where: { id: action.id },
      data: {
        status: CalendarSyncActionStatus.DONE,
        ...(pushedMapping ? { mappingId: pushedMapping.id } : {}),
        calendarConnectionId: connection.id,
        error: null,
        processedAt: new Date(),
      },
    });

    return jsonSuccess(res, {
      actionId: action.id,
      status: CalendarSyncActionStatus.DONE,
      mapping: pushedMapping,
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

      const failedMappingId = action.mappingId || mapping?.id;

      if (failedMappingId) {
        await tx.calendarEventMapping.update({
          where: { id: failedMappingId },
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
