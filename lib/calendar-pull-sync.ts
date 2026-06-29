import {
  AppointmentSource,
  AppointmentStatus,
  CalendarConnectionStatus,
  CalendarEventSyncStatus,
} from "@prisma/client";
import { matchPatientFromEventTitle } from "./patient-matching";
import { prisma } from "./prisma";

interface IcsEvent {
  uid: string | null;
  externalEventId: string | null;
  recurrenceId: string | null;
  summary: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  description: string | null;
}

interface CalendarSyncEventPayload {
  uid: string | null;
  externalEventId: string | null;
  summary: string | null;
  startsAt: string | null;
  endsAt: string | null;
  confidence: number;
  reason: string;
  patientName: string | null;
  appointmentId: string | null;
  persisted: boolean;
  action:
    | "created"
    | "updated"
    | "mapped_existing"
    | "created_from_orphan_mapping"
    | "unmatched"
    | "skipped"
    | "failed";
}

export class CalendarPullSyncError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 502) {
    super(message);
    this.name = "CalendarPullSyncError";
    this.statusCode = statusCode;
  }
}

const AUTO_MATCH_THRESHOLD = 0.7;
const MAX_SYNC_EVENTS = 50;

const appointmentInclude = {
  patient: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
    },
  },
  session: {
    select: {
      id: true,
    },
  },
};

const serializeAppointment = <
  T extends { session?: { id: string } | null }
>(
  appointment: T
) => {
  const { session, ...rest } = appointment;

  return {
    ...rest,
    linkedSessionId: session?.id || null,
    hasSession: Boolean(session?.id),
  };
};

const toFetchableCalendarUrl = (calendarUrl: string) => {
  return calendarUrl.startsWith("webcal://")
    ? `https://${calendarUrl.slice("webcal://".length)}`
    : calendarUrl;
};

const unfoldIcs = (value: string) => value.replace(/\r?\n[ \t]/g, "");

const unescapeIcsText = (value: string) => {
  return value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
};

const getIcsValue = (block: string, property: string) => {
  const lines = block.split(/\r?\n/);
  const line = lines.find((item) => {
    const [left] = item.split(":", 1);
    return left?.split(";")[0]?.toUpperCase() === property;
  });

  if (!line) return null;

  const separatorIndex = line.indexOf(":");
  if (separatorIndex === -1) return null;

  return line.slice(separatorIndex + 1).trim();
};

const parseIcsDate = (value: string | null) => {
  if (!value) return null;

  const trimmed = value.trim();
  const dateOnly = trimmed.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dateOnly) {
    return new Date(
      Date.UTC(
        Number(dateOnly[1]),
        Number(dateOnly[2]) - 1,
        Number(dateOnly[3])
      )
    );
  }

  const dateTime = trimmed.match(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/
  );
  if (!dateTime) return null;

  const [, year, month, day, hour, minute, second, utc] = dateTime;

  if (utc === "Z") {
    return new Date(
      Date.UTC(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(minute),
        Number(second)
      )
    );
  }

  return new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second)
  );
};

const parseIcsEvents = (ics: string): IcsEvent[] => {
  const unfolded = unfoldIcs(ics);
  const blocks = unfolded.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) || [];

  return blocks.map((block) => {
    const uid = getIcsValue(block, "UID");
    const recurrenceId = getIcsValue(block, "RECURRENCE-ID");

    return {
      uid,
      externalEventId: uid
        ? [uid, recurrenceId].filter(Boolean).join("::")
        : null,
      recurrenceId,
      summary: unescapeIcsText(getIcsValue(block, "SUMMARY") || ""),
      startsAt: parseIcsDate(getIcsValue(block, "DTSTART")),
      endsAt: parseIcsDate(getIcsValue(block, "DTEND")),
      description: unescapeIcsText(getIcsValue(block, "DESCRIPTION") || ""),
    };
  });
};

const buildImportedNotes = ({
  summary,
  description,
}: {
  summary: string;
  description: string | null;
}) => {
  return [`Titre: ${summary}`, description].filter(Boolean).join("\n");
};

const toSyncEventPayload = ({
  uid,
  externalEventId,
  summary,
  startsAt,
  endsAt,
  confidence,
  reason,
  patientName,
  appointmentId,
  persisted,
  action,
}: {
  uid: string | null;
  externalEventId: string | null;
  summary: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  confidence: number;
  reason: string;
  patientName: string | null;
  appointmentId: string | null;
  persisted: boolean;
  action: CalendarSyncEventPayload["action"];
}): CalendarSyncEventPayload => ({
  uid,
  externalEventId,
  summary,
  startsAt: startsAt?.toISOString() || null,
  endsAt: endsAt?.toISOString() || null,
  confidence,
  reason,
  patientName,
  appointmentId,
  persisted,
  action,
});

export async function pullCalendarConnectionEvents({
  cabinetId,
  connectionId,
  debug = false,
}: {
  cabinetId: string;
  connectionId: string;
  debug?: boolean;
}) {
  const connection = await prisma.calendarConnection.findFirst({
    where: { id: connectionId, entityId: cabinetId },
    select: {
      id: true,
      provider: true,
      calendarUrl: true,
    },
  });

  if (!connection) {
    throw new CalendarPullSyncError("Calendar connection not found", 404);
  }

  try {
    const response = await fetch(toFetchableCalendarUrl(connection.calendarUrl));

    if (!response.ok) {
      throw new Error(`Calendar fetch failed with status ${response.status}`);
    }

    const ics = await response.text();
    const events = parseIcsEvents(ics).slice(0, MAX_SYNC_EVENTS);
    const patients = await prisma.patient.findMany({
      where: { entityId: cabinetId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
      },
    });

    let importedCount = 0;
    let updatedCount = 0;
    let mappedExistingCount = 0;
    let unmatchedCount = 0;
    let skippedCount = 0;
    let failedPersistenceCount = 0;
    const appointments: Array<Record<string, unknown>> = [];
    const recognizedEvents: CalendarSyncEventPayload[] = [];
    const unmatchedEvents: CalendarSyncEventPayload[] = [];
    const skippedEvents: CalendarSyncEventPayload[] = [];
    const failures: Array<{
      uid: string | null;
      summary: string | null;
      reason: string;
    }> = [];

    for (const event of events) {
      const uid = event.uid?.trim();
      const externalEventId = event.externalEventId?.trim();
      const summary = event.summary?.trim();

      if (!uid || !externalEventId || !summary || !event.startsAt || !event.endsAt) {
        skippedCount += 1;
        skippedEvents.push(
          toSyncEventPayload({
            uid: uid || null,
            externalEventId: externalEventId || null,
            summary: summary || null,
            startsAt: event.startsAt,
            endsAt: event.endsAt,
            confidence: 0,
            reason: "VEVENT incomplet: UID, SUMMARY, DTSTART ou DTEND manquant",
            patientName: null,
            appointmentId: null,
            persisted: false,
            action: "skipped",
          })
        );
        continue;
      }

      const startsAt = event.startsAt;
      const endsAt = event.endsAt;

      if (endsAt <= startsAt) {
        skippedCount += 1;
        skippedEvents.push(
          toSyncEventPayload({
            uid,
            externalEventId,
            summary,
            startsAt,
            endsAt,
            confidence: 0,
            reason: "VEVENT ignoré: DTEND doit être après DTSTART",
            patientName: null,
            appointmentId: null,
            persisted: false,
            action: "skipped",
          })
        );
        continue;
      }

      const match = matchPatientFromEventTitle(summary, patients);
      const patient =
        match.patientId && match.confidence >= AUTO_MATCH_THRESHOLD
          ? patients.find((item) => item.id === match.patientId) || null
          : null;
      const notes = buildImportedNotes({
        summary,
        description: event.description,
      });

      const mapping = await prisma.calendarEventMapping.findUnique({
        where: {
          calendarConnectionId_externalEventId: {
            calendarConnectionId: connection.id,
            externalEventId,
          },
        },
        include: {
          appointment: {
            include: appointmentInclude,
          },
        },
      });

      if (mapping?.syncStatus === CalendarEventSyncStatus.LOCAL_PENDING) {
        await prisma.calendarEventMapping.update({
          where: { id: mapping.id },
          data: {
            syncStatus: CalendarEventSyncStatus.CONFLICT,
            lastSyncError: "Modification locale en attente de push",
          },
        });

        skippedCount += 1;
        skippedEvents.push(
          toSyncEventPayload({
            uid,
            externalEventId,
            summary,
            startsAt,
            endsAt,
            confidence: match.confidence,
            reason: "Modification locale en attente de push",
            patientName: mapping.appointment.patient
              ? `${mapping.appointment.patient.firstName} ${mapping.appointment.patient.lastName}`.trim()
              : null,
            appointmentId: mapping.appointmentId,
            persisted: false,
            action: "skipped",
          })
        );
        continue;
      }

      if (mapping) {
        try {
          const appointment = await prisma.appointment.update({
            where: { id: mapping.appointmentId },
            data: {
              startsAt,
              endsAt,
              ...(patient ? { patientId: patient.id } : {}),
              status: AppointmentStatus.SCHEDULED,
              source: AppointmentSource.APPLE_CALENDAR,
              notes,
            },
            include: appointmentInclude,
          });

          await prisma.calendarEventMapping.update({
            where: { id: mapping.id },
            data: {
              lastPulledAt: new Date(),
              syncStatus: CalendarEventSyncStatus.SYNCED,
              lastSyncError: null,
            },
          });

          updatedCount += 1;
          appointments.push({
            ...serializeAppointment(appointment),
            matchedAutomatically: true,
            confidence: match.confidence,
            reason: "Événement Apple Calendar reconnu par mapping existant",
            persisted: true,
            action: "updated",
          });
          recognizedEvents.push(
            toSyncEventPayload({
              uid,
              externalEventId,
              summary,
              startsAt,
              endsAt,
              confidence: match.confidence,
              reason: "Mapping Apple Calendar existant",
              patientName: appointment.patient
                ? `${appointment.patient.firstName} ${appointment.patient.lastName}`.trim()
                : null,
              appointmentId: appointment.id,
              persisted: true,
              action: "updated",
            })
          );
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Impossible de persister l'événement reconnu";

          failedPersistenceCount += 1;
          skippedCount += 1;
          failures.push({ uid, summary, reason: message });

          await prisma.calendarEventMapping.update({
            where: { id: mapping.id },
            data: {
              syncStatus: CalendarEventSyncStatus.ERROR,
              lastSyncError: message,
            },
          });

          skippedEvents.push(
            toSyncEventPayload({
              uid,
              externalEventId,
              summary,
              startsAt,
              endsAt,
              confidence: match.confidence,
              reason: message,
              patientName: mapping.appointment.patient
                ? `${mapping.appointment.patient.firstName} ${mapping.appointment.patient.lastName}`.trim()
                : null,
              appointmentId: mapping.appointmentId,
              persisted: false,
              action: "failed",
            })
          );
        }
        continue;
      }

      if (!patient) {
        unmatchedCount += 1;
        unmatchedEvents.push(
          toSyncEventPayload({
            uid,
            externalEventId,
            summary,
            startsAt,
            endsAt,
            confidence: match.confidence,
            reason:
              match.confidence > 0
                ? `${match.reason}. Confiance trop faible pour créer automatiquement le rendez-vous.`
                : "Aucun patient reconnu.",
            patientName: null,
            appointmentId: null,
            persisted: false,
            action: "unmatched",
          })
        );
        continue;
      }

      try {
        const existingAppointment = await prisma.appointment.findFirst({
          where: {
            entityId: cabinetId,
            patientId: patient.id,
            startsAt,
            endsAt,
            source: {
              in: [AppointmentSource.APPLE_CALENDAR, AppointmentSource.MANUAL],
            },
            calendarEventMapping: null,
          },
          include: appointmentInclude,
        });

        if (existingAppointment) {
          const appointment = await prisma.$transaction(async (tx) => {
            await tx.appointment.update({
              where: { id: existingAppointment.id },
              data: {
                source: AppointmentSource.APPLE_CALENDAR,
                status: AppointmentStatus.SCHEDULED,
                notes,
              },
            });

            await tx.calendarEventMapping.create({
              data: {
                entityId: cabinetId,
                appointmentId: existingAppointment.id,
                calendarConnectionId: connection.id,
                provider: connection.provider,
                externalEventId,
                lastPulledAt: new Date(),
                syncStatus: CalendarEventSyncStatus.SYNCED,
              },
            });

            return tx.appointment.findUniqueOrThrow({
              where: { id: existingAppointment.id },
              include: appointmentInclude,
            });
          });

          mappedExistingCount += 1;
          appointments.push({
            ...serializeAppointment(appointment),
            matchedAutomatically: true,
            confidence: match.confidence,
            reason: "Événement Apple Calendar rattaché à un rendez-vous existant",
            persisted: true,
            action: "mapped_existing",
          });
          recognizedEvents.push(
            toSyncEventPayload({
              uid,
              externalEventId,
              summary,
              startsAt,
              endsAt,
              confidence: match.confidence,
              reason: "Rendez-vous existant rattaché au mapping Apple Calendar",
              patientName: `${patient.firstName} ${patient.lastName}`.trim(),
              appointmentId: appointment.id,
              persisted: true,
              action: "mapped_existing",
            })
          );
          continue;
        }

        const appointment = await prisma.$transaction(async (tx) => {
          const createdAppointment = await tx.appointment.create({
            data: {
              entityId: cabinetId,
              patientId: patient.id,
              startsAt,
              endsAt,
              status: AppointmentStatus.SCHEDULED,
              source: AppointmentSource.APPLE_CALENDAR,
              notes,
            },
            include: appointmentInclude,
          });

          await tx.calendarEventMapping.create({
            data: {
              entityId: cabinetId,
              appointmentId: createdAppointment.id,
              calendarConnectionId: connection.id,
              provider: connection.provider,
              externalEventId,
              lastPulledAt: new Date(),
              syncStatus: CalendarEventSyncStatus.SYNCED,
            },
          });

          return createdAppointment;
        });

        importedCount += 1;
        appointments.push({
          ...serializeAppointment(appointment),
          matchedAutomatically: true,
          confidence: match.confidence,
          reason: match.reason,
          persisted: true,
          action: "created",
        });
        recognizedEvents.push(
          toSyncEventPayload({
            uid,
            externalEventId,
            summary,
            startsAt,
            endsAt,
            confidence: match.confidence,
            reason: match.reason,
            patientName: `${patient.firstName} ${patient.lastName}`.trim(),
            appointmentId: appointment.id,
            persisted: true,
            action: "created",
          })
        );
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Impossible de persister l'événement reconnu";

        failedPersistenceCount += 1;
        skippedCount += 1;
        failures.push({ uid, summary, reason: message });
        skippedEvents.push(
          toSyncEventPayload({
            uid,
            externalEventId,
            summary,
            startsAt,
            endsAt,
            confidence: match.confidence,
            reason: message,
            patientName: `${patient.firstName} ${patient.lastName}`.trim(),
            appointmentId: null,
            persisted: false,
            action: "failed",
          })
        );
      }
    }

    const updatedConnection = await prisma.calendarConnection.update({
      where: { id: connectionId },
      data: {
        lastSyncedAt: new Date(),
        status: CalendarConnectionStatus.CONNECTED,
        lastError: null,
      },
      select: {
        id: true,
        status: true,
        lastSyncedAt: true,
        lastError: true,
      },
    });

    return {
      importedCount,
      createdCount: importedCount,
      updatedCount,
      mappedExistingCount,
      unmatchedCount,
      skippedCount,
      failedPersistenceCount,
      persistedCount: recognizedEvents.filter((event) => event.persisted).length,
      appointments,
      recognizedEvents,
      unmatchedEvents,
      skippedEvents,
      connection: updatedConnection,
      ...(debug
        ? {
            debug: {
              parsedCount: events.length,
              recognizedCount: recognizedEvents.length,
              persistedCount: recognizedEvents.filter((event) => event.persisted)
                .length,
              createdCount: importedCount,
              updatedCount,
              mappedExistingCount,
              unmatchedCount,
              skippedCount,
              failedPersistenceCount,
              failures,
            },
          }
        : {}),
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Calendar sync failed";

    await prisma.calendarConnection.update({
      where: { id: connectionId },
      data: {
        status: CalendarConnectionStatus.ERROR,
        lastError: message,
      },
    });

    throw new CalendarPullSyncError(message, 502);
  }
}
