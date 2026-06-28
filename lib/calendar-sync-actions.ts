import {
  CalendarEventSyncStatus,
  CalendarProvider,
  CalendarSyncActionStatus,
  CalendarSyncActionType,
  CalendarWriteStatus,
} from "@prisma/client";
import {
  createCalDavEvent,
  deleteCalDavEvent,
  decryptCalDavPassword,
  isWritableCalendarTargetUrl,
  READ_ONLY_APPLE_CALENDAR_URL_MESSAGE,
  updateCalDavEvent,
} from "./apple-caldav";
import { prisma } from "./prisma";

export class CalendarSyncActionPushError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "CalendarSyncActionPushError";
    this.statusCode = statusCode;
  }
}

const mappingSelect = {
  id: true,
  appointmentId: true,
  calendarConnectionId: true,
  provider: true,
  externalEventId: true,
  externalCalendarId: true,
  externalEtag: true,
  lastPushedAt: true,
  syncStatus: true,
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

  const patientName =
    `${action.appointment.patient.firstName} ${action.appointment.patient.lastName}`.trim();
  return patientName ? `Rendez-vous - ${patientName}` : "Rendez-vous Hugo";
};

export async function pushCalendarSyncAction(
  actionId: string,
  cabinetId: string
) {
  const action = await prisma.calendarSyncAction.findFirst({
    where: { id: actionId, entityId: cabinetId },
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
    throw new CalendarSyncActionPushError(
      "Calendar sync action not found",
      404
    );
  }

  if (
    action.status !== CalendarSyncActionStatus.PENDING &&
    action.status !== CalendarSyncActionStatus.FAILED
  ) {
    throw new CalendarSyncActionPushError("Action must be PENDING or FAILED");
  }

  if (
    action.actionType !== CalendarSyncActionType.CREATE_EVENT &&
    action.actionType !== CalendarSyncActionType.UPDATE_EVENT &&
    action.actionType !== CalendarSyncActionType.DELETE_EVENT
  ) {
    throw new CalendarSyncActionPushError("Action non supportée dans ce run.");
  }

  if (
    action.actionType !== CalendarSyncActionType.DELETE_EVENT &&
    !action.appointment
  ) {
    throw new CalendarSyncActionPushError(
      "Appointment linked to this action is missing"
    );
  }

  if (
    action.actionType !== CalendarSyncActionType.DELETE_EVENT &&
    (!action.appointment?.startsAt || !action.appointment.endsAt)
  ) {
    throw new CalendarSyncActionPushError("Dates de rendez-vous manquantes.");
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
            entityId: cabinetId,
          },
        })
      : null) ||
    (await prisma.calendarConnection.findFirst({
      where: {
        entityId: cabinetId,
        provider: CalendarProvider.APPLE_CALENDAR,
        writeStatus: CalendarWriteStatus.READY,
        writeEnabled: true,
      },
      orderBy: { updatedAt: "desc" },
    }));

  if (!connection) {
    throw new CalendarSyncActionPushError(
      "Aucune connexion Apple Calendar prête."
    );
  }

  if (
    connection.writeStatus !== CalendarWriteStatus.READY ||
    !connection.writeEnabled
  ) {
    throw new CalendarSyncActionPushError(
      "L’écriture Apple Calendar n’est pas prête. Testez d’abord la connexion CalDAV."
    );
  }

  if (!connection.caldavUsername || !connection.caldavPasswordEncrypted) {
    throw new CalendarSyncActionPushError("Configuration CalDAV incomplète.");
  }

  if (!connection.selectedCalendarUrl) {
    throw new CalendarSyncActionPushError(
      "Aucun calendrier cible Apple Calendar sélectionné. Sélectionnez un calendrier cible avant de pousser l’événement."
    );
  }

  if (!isWritableCalendarTargetUrl(connection.selectedCalendarUrl)) {
    throw new CalendarSyncActionPushError(
      READ_ONLY_APPLE_CALENDAR_URL_MESSAGE
    );
  }

  if (action.actionType === CalendarSyncActionType.UPDATE_EVENT) {
    if (!mapping) {
      throw new CalendarSyncActionPushError(
        "Mapping Apple Calendar introuvable pour ce rendez-vous."
      );
    }

    if (!mapping.externalEventId) {
      throw new CalendarSyncActionPushError("UID Apple Calendar manquant.");
    }
  }

  if (action.actionType === CalendarSyncActionType.DELETE_EVENT) {
    const externalEventId = mapping?.externalEventId || payloadExternalEventId;

    if (!externalEventId) {
      throw new CalendarSyncActionPushError("UID Apple Calendar manquant.");
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
    const selectedCalendarUrl = connection.selectedCalendarUrl;
    const caldavUsername = connection.caldavUsername;
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
                entityId: cabinetId,
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
              select: mappingSelect,
            });
          })()
        : action.actionType === CalendarSyncActionType.UPDATE_EVENT
          ? await (async () => {
              if (!appointment) {
                throw new Error("Appointment linked to this action is missing");
              }

              if (!mapping) {
                throw new Error(
                  "Mapping Apple Calendar introuvable pour ce rendez-vous."
                );
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
                select: mappingSelect,
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
                etag:
                  mapping?.externalEtag ||
                  getPayloadString(action.payload, "etag"),
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
                select: mappingSelect,
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

    return {
      actionId: action.id,
      actionType: action.actionType,
      status: CalendarSyncActionStatus.DONE,
      mapping: pushedMapping,
    };
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

    throw new CalendarSyncActionPushError(message, 502);
  }
}
