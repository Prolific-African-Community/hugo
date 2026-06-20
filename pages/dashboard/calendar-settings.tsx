import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/router";

type CalendarProvider = "APPLE_CALENDAR";
type CalendarConnectionStatus = "CONNECTED" | "DISCONNECTED" | "ERROR";
type CalendarWriteStatus = "NOT_CONFIGURED" | "READY" | "ERROR" | "DISABLED";
type CalendarSyncActionType = "CREATE_EVENT" | "UPDATE_EVENT" | "DELETE_EVENT";
type CalendarSyncActionStatus =
  | "PENDING"
  | "PROCESSING"
  | "DONE"
  | "FAILED"
  | "CANCELLED";

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

interface CalendarConnection {
  id: string;
  entityId: string;
  provider: CalendarProvider;
  name: string;
  calendarUrl: string;
  status: CalendarConnectionStatus;
  writeEnabled: boolean;
  caldavUrl?: string | null;
  caldavUsername?: string | null;
  selectedCalendarUrl?: string | null;
  selectedCalendarName?: string | null;
  capabilities?: CalendarCapabilities | null;
  lastWriteTestAt?: string | null;
  writeStatus: CalendarWriteStatus;
  writeLastError?: string | null;
  lastSyncedAt?: string | null;
  lastError?: string | null;
  createdAt: string;
  updatedAt: string;
  syncActions?: CalendarSyncAction[];
}

interface CalendarConnectionForm {
  name: string;
  calendarUrl: string;
}

interface CalDavCalendar {
  name: string;
  url: string;
}

interface CalendarCapabilities {
  calendars?: CalDavCalendar[];
  calendarCount?: number;
  testedAt?: string;
}

interface CalDavForm {
  caldavUrl: string;
  username: string;
  password: string;
  targetCalendarUrl: string;
}

interface CalDavTestResult {
  writeEnabled: boolean;
  writeStatus: CalendarWriteStatus;
  lastWriteTestAt?: string | null;
  selectedCalendarUrl?: string | null;
  selectedCalendarName?: string | null;
  calendars: CalDavCalendar[];
}

interface CalendarSyncAction {
  id: string;
  actionType: CalendarSyncActionType;
  status: CalendarSyncActionStatus;
  error?: string | null;
  createdAt: string;
  appointment?: {
    id: string;
    startsAt: string;
    endsAt: string;
    patient: {
      id: string;
      firstName: string;
      lastName: string;
    };
  } | null;
}

interface CalendarSyncPushResult {
  actionId: string;
  status: CalendarSyncActionStatus;
  mapping: {
    id: string;
    appointmentId: string;
    externalEventId: string;
    externalCalendarId?: string | null;
    syncStatus: string;
  };
}

interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  email?: string | null;
}

interface NewPatientDraft {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  notes: string;
}

interface CalendarSyncEvent {
  uid: string | null;
  summary: string | null;
  startsAt: string | null;
  endsAt: string | null;
  confidence: number;
  reason: string;
  patientName: string | null;
  appointmentId: string | null;
}

interface CalendarSyncResult {
  importedCount: number;
  updatedCount: number;
  unmatchedCount: number;
  skippedCount: number;
  recognizedEvents: CalendarSyncEvent[];
  unmatchedEvents: CalendarSyncEvent[];
  skippedEvents: CalendarSyncEvent[];
  connection: Pick<
    CalendarConnection,
    "id" | "status" | "lastSyncedAt" | "lastError"
  >;
}

type ClassValue = string | false | null | undefined;
type IconName = "grid" | "calendar" | "upload" | "link";

const cn = (...classes: ClassValue[]) => classes.filter(Boolean).join(" ");
const PAGE_BG = "bg-[#f7f8f6]";
const CARD =
  "rounded-[1.35rem] border border-white/70 bg-white/68 shadow-[0_18px_55px_rgba(54,69,79,0.055)] backdrop-blur-xl";
const INPUT =
  "w-full rounded-2xl border border-white/80 bg-white/65 px-4 py-3 text-sm font-medium text-black outline-none transition placeholder:text-black/30 focus:border-cyan-200 focus:bg-white/90 focus:ring-4 focus:ring-cyan-100/45";
const BUTTON_DARK =
  "inline-flex items-center justify-center gap-2 rounded-full bg-[#202522] px-4 py-2.5 text-xs font-semibold text-white shadow-[0_10px_25px_rgba(30,37,34,0.12)] transition-all duration-200 hover:-translate-y-px hover:bg-[#303832] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50";
const BUTTON_LIGHT =
  "inline-flex items-center justify-center gap-2 rounded-full border border-white/70 bg-white/55 px-4 py-2.5 text-xs font-semibold text-black/72 shadow-[0_10px_24px_rgba(54,69,79,0.045)] backdrop-blur-xl transition hover:border-cyan-100 hover:bg-cyan-50/70 hover:text-black disabled:cursor-not-allowed disabled:opacity-50";

const emptyForm = (): CalendarConnectionForm => ({
  name: "Apple Calendar",
  calendarUrl: "",
});

function Icon({
  name,
  className = "h-4 w-4",
}: {
  name: IconName;
  className?: string;
}) {
  const paths: Record<IconName, JSX.Element> = {
    grid: (
      <>
        <path d="M4 4h6v6H4z" />
        <path d="M14 4h6v6h-6z" />
        <path d="M4 14h6v6H4z" />
        <path d="M14 14h6v6h-6z" />
      </>
    ),
    calendar: (
      <>
        <path d="M5 6h14v14H5z" />
        <path d="M8 3v5" />
        <path d="M16 3v5" />
        <path d="M5 10h14" />
      </>
    ),
    upload: (
      <>
        <path d="M12 16V4" />
        <path d="m7 9 5-5 5 5" />
        <path d="M5 20h14" />
      </>
    ),
    link: (
      <>
        <path d="M10 13a5 5 0 0 0 7.1 0l1.4-1.4a5 5 0 0 0-7.1-7.1L10.5 5.4" />
        <path d="M14 11a5 5 0 0 0-7.1 0l-1.4 1.4a5 5 0 0 0 7.1 7.1l.9-.9" />
      </>
    ),
  };

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.55"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

function LogoMark() {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-6 w-7 items-center gap-[3px]">
        <span className="h-6 w-3 rounded-[2px] bg-black" />
        <span className="h-6 w-3 rounded-[2px] bg-black" />
      </div>
      <span className="text-sm font-bold tracking-tight text-black">Hugo</span>
    </div>
  );
}

function statusTone(status: CalendarConnectionStatus) {
  if (status === "CONNECTED") {
    return "border-[#dbead7]/80 bg-[#f0f8ee]/75 text-[#5f7f68]";
  }

  if (status === "ERROR") {
    return "border-[#f3ddd7]/80 bg-[#fff1ed]/80 text-[#9a6657]";
  }

  return "border-[#eadfca]/80 bg-[#fff7e6]/80 text-[#7b6745]";
}

function writeStatusLabel(status: CalendarWriteStatus) {
  const labels: Record<CalendarWriteStatus, string> = {
    NOT_CONFIGURED: "Non configurée",
    READY: "Prête",
    ERROR: "Erreur",
    DISABLED: "Désactivée",
  };

  return labels[status];
}

function writeStatusTone(status: CalendarWriteStatus) {
  if (status === "READY") {
    return "border-[#dbead7]/80 bg-[#f0f8ee]/75 text-[#5f7f68]";
  }

  if (status === "ERROR") {
    return "border-[#f3ddd7]/80 bg-[#fff1ed]/80 text-[#9a6657]";
  }

  if (status === "DISABLED") {
    return "border-black/10 bg-white/50 text-black/45";
  }

  return "border-[#eadfca]/80 bg-[#fff7e6]/80 text-[#7b6745]";
}

function syncActionTone(status: CalendarSyncActionStatus) {
  if (status === "FAILED") {
    return "border-[#f3ddd7]/80 bg-[#fff1ed]/80 text-[#9a6657]";
  }

  if (status === "PENDING") {
    return "border-[#eadfca]/80 bg-[#fff7e6]/80 text-[#7b6745]";
  }

  return "border-cyan-100/80 bg-cyan-50/70 text-cyan-800/70";
}

function formatDate(value?: string | null) {
  if (!value) return "Jamais";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date inconnue";

  return new Intl.DateTimeFormat("fr-LU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function patientName(patient: Patient) {
  return `${patient.firstName} ${patient.lastName}`.trim();
}

function confidencePercent(confidence?: number) {
  return `${Math.round((confidence ?? 0) * 100)}%`;
}

function confidenceTone(confidence?: number) {
  const score = confidence ?? 0;

  if (score >= 0.9) {
    return "border-[#dbead7]/80 bg-[#f0f8ee]/75 text-[#5f7f68]";
  }

  if (score >= 0.7) {
    return "border-[#eadfca]/80 bg-[#fff7e6]/80 text-[#7b6745]";
  }

  return "border-[#f3ddd7]/80 bg-[#fff1ed]/80 text-[#9a6657]";
}

function eventKey(event: CalendarSyncEvent) {
  return event.uid || `${event.summary || "event"}-${event.startsAt || "date"}`;
}

function inferPatientFromSummary(summary?: string | null): Pick<NewPatientDraft, "firstName" | "lastName"> {
  if (!summary) {
    return { firstName: "", lastName: "" };
  }

  const noiseWords = new Set([
    "seance",
    "séance",
    "kine",
    "kiné",
    "rdv",
    "rendez",
    "vous",
    "rendez-vous",
    "consultation",
  ]);

  const normalized = summary
    .replace(/[|:/()[\]{}]+/g, " ")
    .replace(/\s+-\s+.*/g, " ")
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !noiseWords.has(part.toLowerCase()));

  const nameParts = normalized
    .filter((part) => /^[A-Za-zÀ-ÖØ-öø-ÿ'-]+\.?$/.test(part))
    .map((part) => part.replace(/\.$/, ""));

  return {
    firstName: nameParts[0] || "",
    lastName: nameParts[1] || "",
  };
}

function newPatientDraftFromEvent(event: CalendarSyncEvent): NewPatientDraft {
  const inferred = inferPatientFromSummary(event.summary);

  return {
    firstName: inferred.firstName,
    lastName: inferred.lastName,
    phone: "",
    email: "",
    notes: `Créé depuis Apple Calendar : ${event.summary || "Sans titre"}`,
  };
}

function calendarsFromConnection(connection: CalendarConnection) {
  return Array.isArray(connection.capabilities?.calendars)
    ? connection.capabilities.calendars
    : [];
}

export default function CalendarSettingsPage() {
  const router = useRouter();
  const [connections, setConnections] = useState<CalendarConnection[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [form, setForm] = useState<CalendarConnectionForm>(emptyForm());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [testingCalDavId, setTestingCalDavId] = useState<string | null>(null);
  const [pushingActionId, setPushingActionId] = useState<string | null>(null);
  const [selectingCalendarKey, setSelectingCalendarKey] = useState<
    string | null
  >(null);
  const [syncResults, setSyncResults] = useState<Record<string, CalendarSyncResult>>(
    {}
  );
  const [caldavFormByConnection, setCaldavFormByConnection] = useState<
    Record<string, CalDavForm>
  >({});
  const [discoveredCalendarsByConnection, setDiscoveredCalendarsByConnection] =
    useState<Record<string, CalDavCalendar[]>>({});
  const [selectedPatientByEvent, setSelectedPatientByEvent] = useState<
    Record<string, string>
  >({});
  const [creatingAppointmentKey, setCreatingAppointmentKey] = useState<
    string | null
  >(null);
  const [newPatientByEvent, setNewPatientByEvent] = useState<
    Record<string, NewPatientDraft>
  >({});
  const [newPatientOpenByEvent, setNewPatientOpenByEvent] = useState<
    Record<string, boolean>
  >({});
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const request = async <T,>(url: string, options: RequestInit = {}) => {
    const token = localStorage.getItem("token");

    if (!token) {
      router.replace("/login");
      throw new Error("Votre session a expire. Veuillez vous reconnecter.");
    }

    const response = await fetch(url, {
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
        Authorization: `Bearer ${token}`,
      },
    });

    const payload = (await response.json()) as ApiResponse<T>;

    if (response.status === 401) {
      localStorage.removeItem("token");
      router.replace("/login");
    }

    if (!response.ok || !payload.success) {
      throw new Error(payload.error || payload.message || "Requete impossible");
    }

    return payload.data as T;
  };

  const loadPatients = async (entityId: string) => {
    const data = await request<Patient[]>(
      `/api/hugo/patients?entityId=${encodeURIComponent(entityId)}`
    );
    setPatients(data);
  };

  const loadConnections = async () => {
    setError(null);

    try {
      const data = await request<CalendarConnection[]>(
        "/api/hugo/calendar-connections"
      );
      setConnections(data);
      if (data[0]?.entityId) {
        await loadPatients(data[0].entityId);
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Impossible de charger les connexions agenda"
      );
    } finally {
      setLoading(false);
    }
  };

  const getCalDavForm = (connection: CalendarConnection): CalDavForm => {
    return (
      caldavFormByConnection[connection.id] || {
        caldavUrl: connection.caldavUrl || "https://caldav.icloud.com",
        username: connection.caldavUsername || "",
        password: "",
        targetCalendarUrl: connection.selectedCalendarUrl || "",
      }
    );
  };

  const updateCalDavForm = (
    connection: CalendarConnection,
    field: keyof CalDavForm,
    value: string
  ) => {
    setCaldavFormByConnection((current) => ({
      ...current,
      [connection.id]: {
        ...getCalDavForm(connection),
        ...current[connection.id],
        [field]: value,
      },
    }));
  };

  useEffect(() => {
    if (!router.isReady) return;
    loadConnections();
  }, [router.isReady]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const connection = await request<CalendarConnection>(
        "/api/hugo/calendar-connections",
        {
          method: "POST",
          body: JSON.stringify(form),
        }
      );
      setConnections((current) => [connection, ...current]);
      await loadPatients(connection.entityId);
      setForm(emptyForm());
      setSuccess("Connexion Apple Calendar enregistrée.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Impossible d'enregistrer la connexion"
      );
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (
    connection: CalendarConnection,
    status: CalendarConnectionStatus
  ) => {
    setUpdatingId(connection.id);
    setError(null);
    setSuccess(null);

    try {
      const updatedConnection = await request<CalendarConnection>(
        `/api/hugo/calendar-connections/${connection.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ status }),
        }
      );
      setConnections((current) =>
        current.map((item) =>
          item.id === updatedConnection.id ? updatedConnection : item
        )
      );
      setSuccess("Statut de connexion mis à jour.");
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Impossible de mettre à jour la connexion"
      );
    } finally {
      setUpdatingId(null);
    }
  };

  const handleTestCalDav = async (connection: CalendarConnection) => {
    const formState = getCalDavForm(connection);

    if (!formState.caldavUrl.trim() || !formState.username.trim()) {
      setError("URL CalDAV et identifiant iCloud requis.");
      setSuccess(null);
      return;
    }

    if (!formState.password.trim()) {
      setError("Mot de passe spécifique à l'app requis pour le test.");
      setSuccess(null);
      return;
    }

    setTestingCalDavId(connection.id);
    setError(null);
    setSuccess(null);

    try {
      const result = await request<CalDavTestResult>(
        `/api/hugo/calendar-connections/${connection.id}/test-caldav`,
        {
          method: "POST",
          body: JSON.stringify({
            caldavUrl: formState.caldavUrl,
            username: formState.username,
            password: formState.password,
          }),
        }
      );

      setDiscoveredCalendarsByConnection((current) => ({
        ...current,
        [connection.id]: result.calendars,
      }));
      setConnections((current) =>
        current.map((item) =>
          item.id === connection.id
            ? {
                ...item,
                writeEnabled: result.writeEnabled,
                writeStatus: result.writeStatus,
                writeLastError: null,
                lastWriteTestAt: result.lastWriteTestAt,
                caldavUrl: formState.caldavUrl,
                caldavUsername: formState.username,
                selectedCalendarUrl: result.selectedCalendarUrl,
                selectedCalendarName: result.selectedCalendarName,
                capabilities: {
                  calendars: result.calendars,
                  calendarCount: result.calendars.length,
                },
              }
            : item
        )
      );
      setCaldavFormByConnection((current) => ({
        ...current,
        [connection.id]: {
          caldavUrl: formState.caldavUrl,
          username: formState.username,
          password: "",
          targetCalendarUrl:
            result.selectedCalendarUrl || formState.targetCalendarUrl,
        },
      }));
      setSuccess("Connexion CalDAV prête pour l'écriture future.");
    } catch (testError) {
      setError(
        testError instanceof Error
          ? testError.message
          : "Impossible de tester la connexion CalDAV"
      );
      await loadConnections();
    } finally {
      setTestingCalDavId(null);
    }
  };

  const handleSelectWriteCalendar = async (
    connection: CalendarConnection,
    calendar: CalDavCalendar
  ) => {
    const key = `${connection.id}:${calendar.url}`;
    setSelectingCalendarKey(key);
    setError(null);
    setSuccess(null);

    try {
      const updatedConnection = await request<CalendarConnection>(
        `/api/hugo/calendar-connections/${connection.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            selectedCalendarUrl: calendar.url,
            selectedCalendarName: calendar.name,
          }),
        }
      );

      setConnections((current) =>
        current.map((item) =>
          item.id === updatedConnection.id ? updatedConnection : item
        )
      );
      setCaldavFormByConnection((current) => ({
        ...current,
        [connection.id]: {
          ...getCalDavForm(connection),
          ...current[connection.id],
          targetCalendarUrl: calendar.url,
          password: "",
        },
      }));
      setSuccess("Calendrier cible Apple Calendar sélectionné.");
    } catch (selectError) {
      setError(
        selectError instanceof Error
          ? selectError.message
          : "Impossible de sélectionner ce calendrier"
      );
    } finally {
      setSelectingCalendarKey(null);
    }
  };

  const handleSelectManualWriteCalendar = async (
    connection: CalendarConnection
  ) => {
    const formState = getCalDavForm(connection);
    const targetCalendarUrl = formState.targetCalendarUrl.trim();

    if (!targetCalendarUrl) {
      setError("URL du calendrier cible requise.");
      setSuccess(null);
      return;
    }

    await handleSelectWriteCalendar(connection, {
      name: "Calendrier Apple Calendar",
      url: targetCalendarUrl,
    });
  };

  const handleDisableCalDav = async (connection: CalendarConnection) => {
    setUpdatingId(connection.id);
    setError(null);
    setSuccess(null);

    try {
      const updatedConnection = await request<CalendarConnection>(
        `/api/hugo/calendar-connections/${connection.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            writeEnabled: false,
            writeStatus: "DISABLED",
          }),
        }
      );

      setConnections((current) =>
        current.map((item) =>
          item.id === updatedConnection.id ? updatedConnection : item
        )
      );
      setSuccess("Écriture Apple Calendar désactivée.");
    } catch (disableError) {
      setError(
        disableError instanceof Error
          ? disableError.message
          : "Impossible de désactiver l'écriture Apple Calendar"
      );
    } finally {
      setUpdatingId(null);
    }
  };

  const handlePushCalendarAction = async (action: CalendarSyncAction) => {
    setPushingActionId(action.id);
    setError(null);
    setSuccess(null);

    try {
      await request<CalendarSyncPushResult>(
        `/api/hugo/calendar-sync-actions/${action.id}/push`,
        {
          method: "POST",
        }
      );
      setSuccess("Action poussée vers Apple Calendar.");
      await loadConnections();
    } catch (pushError) {
      setError(
        pushError instanceof Error
          ? pushError.message
          : "Impossible de pousser l'action vers Apple Calendar"
      );
      await loadConnections();
    } finally {
      setPushingActionId(null);
    }
  };

  const handleSync = async (connection: CalendarConnection) => {
    setSyncingId(connection.id);
    setError(null);
    setSuccess(null);

    try {
      const syncResult = await request<CalendarSyncResult>(
        `/api/hugo/calendar-connections/${connection.id}/sync`,
        {
          method: "POST",
        }
      );

      setSyncResults((current) => ({
        ...current,
        [connection.id]: syncResult,
      }));
      setConnections((current) =>
        current.map((item) =>
          item.id === connection.id
            ? {
                ...item,
                status: syncResult.connection.status,
                lastSyncedAt: syncResult.connection.lastSyncedAt,
                lastError: syncResult.connection.lastError,
              }
            : item
        )
      );
      setSuccess("Synchronisation agenda terminée.");
    } catch (syncError) {
      setError(
        syncError instanceof Error
          ? syncError.message
          : "Impossible de synchroniser l'agenda"
      );
      await loadConnections();
    } finally {
      setSyncingId(null);
    }
  };

  const handleCreateAppointmentFromEvent = async (
    connection: CalendarConnection,
    event: CalendarSyncEvent
  ) => {
    const key = `${connection.id}:${eventKey(event)}`;
    const patientId = selectedPatientByEvent[key];
    const patient = patients.find((item) => item.id === patientId);

    if (!patientId || !patient) {
      setError("Choisissez un patient pour créer le rendez-vous.");
      setSuccess(null);
      return;
    }

    if (!event.startsAt || !event.endsAt) {
      setError("Impossible de créer un rendez-vous sans date de début et de fin.");
      setSuccess(null);
      return;
    }

    setCreatingAppointmentKey(key);
    setError(null);
    setSuccess(null);

    try {
      const appointment = await request<{ id: string }>(
        "/api/hugo/appointments",
        {
          method: "POST",
          body: JSON.stringify({
            patientId,
            startsAt: event.startsAt,
            endsAt: event.endsAt,
            status: "SCHEDULED",
            source: "APPLE_CALENDAR",
            notes: [
              `Titre: ${event.summary || "Sans titre"}`,
              "Validation manuelle depuis Connexion agenda",
            ]
              .filter(Boolean)
              .join("\n"),
            ...(event.uid
              ? {
                  calendarConnectionId: connection.id,
                  externalEventId: event.uid,
                }
              : {}),
          }),
        }
      );

      const validatedEvent: CalendarSyncEvent = {
        ...event,
        appointmentId: appointment.id,
        patientName: patientName(patient),
        confidence: 1,
        reason: "Validé manuellement par le praticien.",
      };

      setSyncResults((current) => {
        const currentResult = current[connection.id];
        if (!currentResult) return current;

        return {
          ...current,
          [connection.id]: {
            ...currentResult,
            importedCount: currentResult.importedCount + 1,
            unmatchedCount: Math.max(0, currentResult.unmatchedCount - 1),
            unmatchedEvents: currentResult.unmatchedEvents.filter(
              (item) => eventKey(item) !== eventKey(event)
            ),
            recognizedEvents: [
              validatedEvent,
              ...currentResult.recognizedEvents,
            ].slice(0, 50),
          },
        };
      });

      setSuccess("Rendez-vous créé depuis l'événement Apple Calendar.");
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Impossible de créer le rendez-vous"
      );
    } finally {
      setCreatingAppointmentKey(null);
    }
  };

  const ensureNewPatientDraft = (key: string, event: CalendarSyncEvent) => {
    setNewPatientByEvent((current) => {
      if (current[key]) return current;

      return {
        ...current,
        [key]: newPatientDraftFromEvent(event),
      };
    });
  };

  const updateNewPatientDraft = (
    key: string,
    event: CalendarSyncEvent,
    field: keyof NewPatientDraft,
    value: string
  ) => {
    setNewPatientByEvent((current) => ({
      ...current,
      [key]: {
        ...(current[key] || newPatientDraftFromEvent(event)),
        [field]: value,
      },
    }));
  };

  const handleCreatePatientAndAppointmentFromEvent = async (
    connection: CalendarConnection,
    event: CalendarSyncEvent
  ) => {
    const key = `${connection.id}:${eventKey(event)}`;
    const draft = newPatientByEvent[key] || newPatientDraftFromEvent(event);
    const firstName = draft.firstName.trim();
    const lastName = draft.lastName.trim();

    if (!firstName) {
      setError("Le prénom du nouveau patient est requis.");
      setSuccess(null);
      return;
    }

    if (!lastName) {
      setError("Le nom du nouveau patient est requis pour créer le dossier.");
      setSuccess(null);
      return;
    }

    if (!event.startsAt || !event.endsAt) {
      setError("Impossible de créer un rendez-vous sans date de début et de fin.");
      setSuccess(null);
      return;
    }

    setCreatingAppointmentKey(key);
    setError(null);
    setSuccess(null);

    try {
      const patient = await request<Patient>("/api/hugo/patients", {
        method: "POST",
        body: JSON.stringify({
          entityId: connection.entityId,
          firstName,
          lastName,
          phone: draft.phone.trim() || null,
          email: draft.email.trim() || null,
          status: "ACTIVE",
          notes: draft.notes.trim() || null,
        }),
      });

      const appointment = await request<{ id: string }>(
        "/api/hugo/appointments",
        {
          method: "POST",
          body: JSON.stringify({
            patientId: patient.id,
            startsAt: event.startsAt,
            endsAt: event.endsAt,
            status: "SCHEDULED",
            source: "APPLE_CALENDAR",
            notes: [
              `Titre: ${event.summary || "Sans titre"}`,
              "Validation manuelle depuis Connexion agenda",
              "Patient créé depuis l'événement Apple Calendar",
            ]
              .filter(Boolean)
              .join("\n"),
            ...(event.uid
              ? {
                  calendarConnectionId: connection.id,
                  externalEventId: event.uid,
                }
              : {}),
          }),
        }
      );

      const validatedEvent: CalendarSyncEvent = {
        ...event,
        appointmentId: appointment.id,
        patientName: patientName(patient),
        confidence: 1,
        reason: "Patient et rendez-vous créés manuellement.",
      };

      setPatients((current) => [patient, ...current]);
      setSyncResults((current) => {
        const currentResult = current[connection.id];
        if (!currentResult) return current;

        return {
          ...current,
          [connection.id]: {
            ...currentResult,
            importedCount: currentResult.importedCount + 1,
            unmatchedCount: Math.max(0, currentResult.unmatchedCount - 1),
            unmatchedEvents: currentResult.unmatchedEvents.filter(
              (item) => eventKey(item) !== eventKey(event)
            ),
            recognizedEvents: [
              validatedEvent,
              ...currentResult.recognizedEvents,
            ].slice(0, 50),
          },
        };
      });
      setNewPatientOpenByEvent((current) => ({ ...current, [key]: false }));
      setSuccess("Patient et rendez-vous créés.");
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Impossible de créer le patient et le rendez-vous"
      );
    } finally {
      setCreatingAppointmentKey(null);
    }
  };

  const handleDelete = async (connection: CalendarConnection) => {
    setDeletingId(connection.id);
    setError(null);
    setSuccess(null);

    try {
      await request<{ id: string }>(
        `/api/hugo/calendar-connections/${connection.id}`,
        {
          method: "DELETE",
        }
      );
      setConnections((current) =>
        current.filter((item) => item.id !== connection.id)
      );
      setSuccess("Connexion agenda supprimée.");
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Impossible de supprimer la connexion"
      );
    } finally {
      setDeletingId(null);
    }
  };

  const primaryConnection = connections[0] || null;
  const primaryCalDavForm = primaryConnection
    ? getCalDavForm(primaryConnection)
    : null;
  const primaryDiscoveredCalendars = primaryConnection
    ? discoveredCalendarsByConnection[primaryConnection.id] ||
      calendarsFromConnection(primaryConnection)
    : [];

  return (
    <div className={cn(PAGE_BG, "min-h-screen text-black")}>
      <header className="border-b border-white/70 bg-white/45 backdrop-blur-2xl">
        <nav className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-5">
          <LogoMark />
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => router.push("/dashboard")}
              className={BUTTON_LIGHT}
            >
              <Icon name="grid" className="h-3.5 w-3.5 text-cyan-700/60" />
              Cockpit
            </button>
            <button
              type="button"
              onClick={() => router.push("/dashboard/appointments")}
              className={BUTTON_LIGHT}
            >
              <Icon name="calendar" className="h-3.5 w-3.5 text-cyan-700/60" />
              Rendez-vous
            </button>
            <button
              type="button"
              onClick={() => router.push("/dashboard/calendar-settings")}
              className={BUTTON_LIGHT}
            >
              <Icon name="calendar" className="h-3.5 w-3.5 text-cyan-700/60" />
              Agenda
            </button>
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-6 pb-16 pt-8">
        <section className={cn(CARD, "relative overflow-hidden p-6 sm:p-8")}>
          <div className="pointer-events-none absolute right-0 top-0 h-52 w-52 rounded-full bg-cyan-100/45 blur-3xl" />
          <div className="pointer-events-none absolute bottom-0 left-1/3 h-40 w-40 rounded-full bg-[#fff0df]/70 blur-3xl" />

          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-700/60">
                Apple Calendar
              </p>
              <h1 className="mt-3 text-4xl font-bold tracking-[-0.055em] sm:text-5xl">
                Connexion agenda
              </h1>
              <p className="mt-3 max-w-2xl text-base font-medium leading-7 text-black/48">
                Enregistrez une URL privée .ics. 
              </p>
            </div>
            <button
              type="button"
              onClick={() => router.push("/dashboard/appointments")}
              className={BUTTON_DARK}
            >
              <Icon name="calendar" className="h-3.5 w-3.5" />
              Voir les rendez-vous
            </button>
          </div>
        </section>

        {(error || success) && (
          <section className="mt-4 space-y-3">
            {error && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-bold text-red-700">
                {error}
              </div>
            )}
            {success && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-bold text-emerald-700">
                {success}
              </div>
            )}
          </section>
        )}

        <section className="mt-4 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-4">
          <form onSubmit={handleSubmit} className={cn(CARD, "overflow-hidden")}>
            <div className="border-b border-black/5 px-5 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-700/60">
                Lecture Apple Calendar
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">
                URL privée .ics
              </h2>
            </div>
            <div className="space-y-4 p-5">
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45">
                  Nom du calendrier
                </span>
                <input
                  value={form.name}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  className={cn(INPUT, "mt-2")}
                  placeholder="Apple Calendar"
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45">
                  URL privée .ics
                </span>
                <input
                  value={form.calendarUrl}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      calendarUrl: event.target.value,
                    }))
                  }
                  className={cn(INPUT, "mt-2")}
                  placeholder="https://pXX-caldav.icloud.com/published/..."
                />
              </label>
              <button type="submit" disabled={saving} className={BUTTON_DARK}>
                <Icon name="link" className="h-3.5 w-3.5" />
                {saving ? "Enregistrement..." : "Connecter Apple Calendar"}
              </button>
              <p className="rounded-2xl border border-cyan-100/80 bg-cyan-50/55 px-4 py-3 text-xs font-semibold leading-5 text-cyan-900/60">
                Lecture Apple Calendar active. Écriture vers Apple Calendar à
                connecter dans une prochaine étape.
              </p>
            </div>
          </form>

          <section className={cn(CARD, "overflow-hidden")}>
            <div className="border-b border-black/5 px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-700/60">
                    Écriture Apple Calendar
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">
                    CalDAV / iCloud
                  </h2>
                </div>
                {primaryConnection && (
                  <span
                    className={cn(
                      "rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.1em]",
                      writeStatusTone(primaryConnection.writeStatus)
                    )}
                  >
                    {writeStatusLabel(primaryConnection.writeStatus)}
                  </span>
                )}
              </div>
            </div>

            {!primaryConnection || !primaryCalDavForm ? (
              <div className="p-5">
                <p className="rounded-3xl border border-[#eadfca]/80 bg-[#fff7e6]/70 px-4 py-4 text-sm font-semibold leading-6 text-[#7b6745]">
                  Connectez d'abord une URL .ics pour créer la connexion
                  agenda, puis activez l'écriture CalDAV.
                </p>
              </div>
            ) : (
              <div className="space-y-4 p-5">
                <p className="rounded-2xl border border-cyan-100/80 bg-cyan-50/55 px-4 py-3 text-xs font-semibold leading-5 text-cyan-900/60">
                  Utilisez un mot de passe spécifique à l'app iCloud. Hugo ne
                  doit jamais utiliser le mot de passe principal Apple ID.
                </p>

                {primaryConnection.writeLastError && (
                  <p className="rounded-2xl border border-[#f3ddd7]/80 bg-[#fff1ed]/80 px-4 py-3 text-xs font-semibold leading-5 text-[#9a6657]">
                    {primaryConnection.writeLastError}
                  </p>
                )}

                {primaryConnection.writeStatus === "READY" &&
                  !primaryConnection.selectedCalendarUrl && (
                    <p className="rounded-2xl border border-[#eadfca]/80 bg-[#fff7e6]/80 px-4 py-3 text-xs font-semibold leading-5 text-[#7b6745]">
                      Connexion prête, mais aucun calendrier cible n'est
                      sélectionné. Sélectionnez d'abord un calendrier cible
                      avant de pousser vers Apple Calendar.
                    </p>
                  )}

                <div className="grid gap-3">
                  <label className="block">
                    <span className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45">
                      URL CalDAV
                    </span>
                    <input
                      value={primaryCalDavForm.caldavUrl}
                      onChange={(inputEvent) =>
                        updateCalDavForm(
                          primaryConnection,
                          "caldavUrl",
                          inputEvent.target.value
                        )
                      }
                      className={cn(INPUT, "mt-2")}
                      placeholder="https://caldav.icloud.com"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45">
                      Identifiant Apple / email iCloud
                    </span>
                    <input
                      value={primaryCalDavForm.username}
                      onChange={(inputEvent) =>
                        updateCalDavForm(
                          primaryConnection,
                          "username",
                          inputEvent.target.value
                        )
                      }
                      className={cn(INPUT, "mt-2")}
                      placeholder="hugo@icloud.com"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45">
                      Mot de passe spécifique à l'app
                    </span>
                    <input
                      type="password"
                      value={primaryCalDavForm.password}
                      onChange={(inputEvent) =>
                        updateCalDavForm(
                          primaryConnection,
                          "password",
                          inputEvent.target.value
                        )
                      }
                      className={cn(INPUT, "mt-2")}
                      placeholder="Toujours vide après sauvegarde"
                      autoComplete="new-password"
                    />
                  </label>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => handleTestCalDav(primaryConnection)}
                    disabled={testingCalDavId === primaryConnection.id}
                    className={BUTTON_DARK}
                  >
                    <Icon name="link" className="h-3.5 w-3.5" />
                    {testingCalDavId === primaryConnection.id
                      ? "Test en cours..."
                      : "Tester la connexion"}
                  </button>
                  {primaryConnection.writeEnabled && (
                    <button
                      type="button"
                      onClick={() => handleDisableCalDav(primaryConnection)}
                      disabled={updatingId === primaryConnection.id}
                      className={BUTTON_LIGHT}
                    >
                      Désactiver l'écriture
                    </button>
                  )}
                </div>

                <div className="rounded-3xl border border-white/70 bg-white/45 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">
                      Statut écriture
                    </p>
                    <span
                      className={cn(
                        "rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.1em]",
                        writeStatusTone(primaryConnection.writeStatus)
                      )}
                    >
                      {writeStatusLabel(primaryConnection.writeStatus)}
                    </span>
                  </div>
                  <p className="mt-2 text-xs font-medium text-black/42">
                    Dernier test : {formatDate(primaryConnection.lastWriteTestAt)}
                  </p>
                  {(primaryConnection.selectedCalendarName ||
                    primaryConnection.selectedCalendarUrl) && (
                    <div className="mt-3 rounded-2xl border border-[#dbead7]/80 bg-[#f0f8ee]/75 px-4 py-3">
                      <p className="text-xs font-bold text-[#5f7f68]">
                        Calendrier cible sélectionné
                      </p>
                      <p className="mt-1 break-all text-xs font-medium text-black/45">
                        {primaryConnection.selectedCalendarName ||
                          primaryConnection.selectedCalendarUrl}
                      </p>
                    </div>
                  )}
                </div>

                {!!primaryDiscoveredCalendars.length && (
                  <div className="rounded-3xl border border-white/70 bg-white/45 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">
                      Calendriers détectés
                    </p>
                    <div className="mt-3 space-y-2">
                      {primaryDiscoveredCalendars.map((calendar) => {
                        const isSelected =
                          primaryConnection.selectedCalendarUrl === calendar.url;
                        const key = `${primaryConnection.id}:${calendar.url}`;

                        return (
                          <div
                            key={calendar.url}
                            className="rounded-2xl border border-white/70 bg-white/60 p-3"
                          >
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <p className="text-sm font-semibold tracking-[-0.02em]">
                                  {calendar.name}
                                </p>
                                <p className="mt-1 break-all text-xs font-medium text-black/38">
                                  {calendar.url}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  handleSelectWriteCalendar(
                                    primaryConnection,
                                    calendar
                                  )
                                }
                                disabled={isSelected || selectingCalendarKey === key}
                                className={isSelected ? BUTTON_LIGHT : BUTTON_DARK}
                              >
                                {isSelected
                                  ? "Sélectionné"
                                  : selectingCalendarKey === key
                                    ? "Sélection..."
                                    : "Utiliser ce calendrier"}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {primaryConnection.writeStatus === "READY" &&
                  !primaryDiscoveredCalendars.length && (
                    <div className="rounded-3xl border border-[#eadfca]/80 bg-[#fff7e6]/55 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7b6745]">
                        Calendrier cible manuel
                      </p>
                      <p className="mt-2 text-xs font-medium leading-5 text-black/45">
                        Utilisez l'URL CalDAV exacte du calendrier iCloud dans
                        lequel Hugo doit écrire.
                      </p>
                      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                        <input
                          value={primaryCalDavForm.targetCalendarUrl}
                          onChange={(inputEvent) =>
                            updateCalDavForm(
                              primaryConnection,
                              "targetCalendarUrl",
                              inputEvent.target.value
                            )
                          }
                          className={INPUT}
                          placeholder="https://caldav.icloud.com/..."
                        />
                        <button
                          type="button"
                          onClick={() =>
                            handleSelectManualWriteCalendar(primaryConnection)
                          }
                          disabled={selectingCalendarKey !== null}
                          className={BUTTON_DARK}
                        >
                          Utiliser ce calendrier
                        </button>
                      </div>
                    </div>
                  )}

                <div className="rounded-3xl border border-white/70 bg-white/45 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">
                        Actions Apple Calendar en attente
                      </p>
                      <p className="mt-1 text-xs font-medium leading-5 text-black/42">
                        Traitement manuel uniquement. Aucun push automatique.
                      </p>
                    </div>
                    <span className="rounded-full border border-white/70 bg-white/65 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-black/45">
                      {primaryConnection.syncActions?.length || 0} action
                      {(primaryConnection.syncActions?.length || 0) > 1 ? "s" : ""}
                    </span>
                  </div>

                  {!primaryConnection.syncActions?.length ? (
                    <p className="mt-4 text-sm font-medium text-black/42">
                      Aucune action en attente.
                    </p>
                  ) : (
                    <div className="mt-4 space-y-3">
                      {primaryConnection.syncActions.map((action) => (
                        <div
                          key={action.id}
                          className="rounded-2xl border border-white/70 bg-white/60 p-3"
                        >
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-semibold tracking-[-0.02em]">
                                  {action.actionType}
                                </p>
                                <span
                                  className={cn(
                                    "rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.1em]",
                                    syncActionTone(action.status)
                                  )}
                                >
                                  {action.status}
                                </span>
                              </div>
                              <p className="mt-2 text-xs font-medium text-black/45">
                                {action.appointment
                                  ? `${patientName(action.appointment.patient)} - ${formatDate(action.appointment.startsAt)}`
                                  : "Rendez-vous introuvable"}
                              </p>
                              {action.error && (
                                <p className="mt-2 rounded-2xl border border-[#f3ddd7]/80 bg-[#fff1ed]/80 px-3 py-2 text-xs font-semibold leading-5 text-[#9a6657]">
                                  {action.error}
                                </p>
                              )}
                            </div>

                            {action.actionType === "CREATE_EVENT" ? (
                              <div className="flex flex-col items-start gap-2 sm:items-end">
                              <button
                                type="button"
                                onClick={() => handlePushCalendarAction(action)}
                                disabled={
                                  pushingActionId === action.id ||
                                  primaryConnection.writeStatus !== "READY" ||
                                  !primaryConnection.selectedCalendarUrl
                                }
                                className={BUTTON_DARK}
                              >
                                <Icon name="upload" className="h-3.5 w-3.5" />
                                {pushingActionId === action.id
                                  ? "Push..."
                                  : "Pousser vers Apple Calendar"}
                              </button>
                              {primaryConnection.writeStatus === "READY" &&
                                !primaryConnection.selectedCalendarUrl && (
                                  <p className="max-w-[220px] text-xs font-semibold leading-5 text-[#7b6745]">
                                    Sélectionnez d'abord un calendrier cible.
                                  </p>
                                )}
                              </div>
                            ) : (
                              <span className="rounded-full border border-black/10 bg-white/55 px-3 py-2 text-xs font-semibold text-black/38">
                                Non supportée dans ce run
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
          </div>

          <div className={cn(CARD, "overflow-hidden")}>
            <div className="border-b border-black/5 px-5 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-700/60">
                Connexions existantes
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">
                Calendriers configurés
              </h2>
            </div>

            {loading ? (
              <div className="space-y-3 p-5">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div
                    key={index}
                    className="h-24 animate-pulse rounded-3xl bg-black/5"
                  />
                ))}
              </div>
            ) : !connections.length ? (
              <p className="px-5 py-12 text-sm font-medium text-black/45">
                Aucune connexion agenda enregistrée.
              </p>
            ) : (
              <div className="divide-y divide-black/5">
                {connections.map((connection) => {
                  const syncResult = syncResults[connection.id];

                  return (
                  <div key={connection.id} className="px-5 py-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold tracking-[-0.02em]">
                            {connection.name}
                          </p>
                          <span
                            className={cn(
                              "rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.1em]",
                              statusTone(connection.status)
                            )}
                          >
                            {connection.status}
                          </span>
                        </div>
                        <p className="mt-2 break-all text-xs font-medium leading-5 text-black/45">
                          {connection.calendarUrl}
                        </p>
                        <p className="mt-3 text-xs font-medium text-black/40">
                          Dernière synchronisation :{" "}
                          {formatDate(connection.lastSyncedAt)}
                        </p>
                        {connection.lastError && (
                          <p className="mt-3 rounded-2xl border border-[#f3ddd7]/80 bg-[#fff1ed]/80 px-4 py-3 text-xs font-semibold leading-5 text-[#9a6657]">
                            {connection.lastError}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2 lg:justify-end">
                        <button
                          type="button"
                          onClick={() => handleSync(connection)}
                          disabled={
                            syncingId === connection.id ||
                            connection.status === "DISCONNECTED"
                          }
                          className={BUTTON_DARK}
                        >
                          <Icon name="upload" className="h-3.5 w-3.5" />
                          {syncingId === connection.id
                            ? "Synchronisation..."
                            : "Synchroniser"}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleStatusChange(
                              connection,
                              connection.status === "CONNECTED"
                                ? "DISCONNECTED"
                                : "CONNECTED"
                            )
                          }
                          disabled={updatingId === connection.id}
                          className={BUTTON_LIGHT}
                        >
                          {connection.status === "CONNECTED"
                            ? "Déconnecter"
                            : "Reconnecter"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(connection)}
                          disabled={deletingId === connection.id}
                          className="inline-flex items-center justify-center gap-2 rounded-full border border-[#f3ddd7]/80 bg-[#fff1ed]/75 px-4 py-2.5 text-xs font-semibold text-[#9a6657] shadow-[0_10px_24px_rgba(154,102,87,0.045)] transition hover:bg-[#ffe7df] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {deletingId === connection.id
                            ? "Suppression..."
                            : "Supprimer"}
                        </button>
                      </div>
                    </div>

                    {syncResult && (
                      <div className="mt-4 space-y-4">
                        <div className="grid gap-3 rounded-3xl border border-white/70 bg-white/45 p-4 backdrop-blur-xl sm:grid-cols-4">
                          <div className="rounded-2xl border border-cyan-100/80 bg-cyan-50/70 px-4 py-3 text-cyan-800/75">
                            <p className="text-xl font-bold tracking-[-0.04em]">
                              {syncResult.importedCount}
                            </p>
                            <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.1em] opacity-70">
                              Importés
                            </p>
                          </div>
                          <div className="rounded-2xl border border-[#dbead7]/80 bg-[#f0f8ee]/75 px-4 py-3 text-[#5f7f68]">
                            <p className="text-xl font-bold tracking-[-0.04em]">
                              {syncResult.updatedCount}
                            </p>
                            <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.1em] opacity-70">
                              Mis à jour
                            </p>
                          </div>
                          <div className="rounded-2xl border border-[#eadfca]/80 bg-[#fff7e6]/80 px-4 py-3 text-[#7b6745]">
                            <p className="text-xl font-bold tracking-[-0.04em]">
                              {syncResult.unmatchedCount}
                            </p>
                            <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.1em] opacity-70">
                              Non reconnus
                            </p>
                          </div>
                          <div className="rounded-2xl border border-[#f3ddd7]/80 bg-[#fff1ed]/80 px-4 py-3 text-[#9a6657]">
                            <p className="text-xl font-bold tracking-[-0.04em]">
                              {syncResult.skippedCount}
                            </p>
                            <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.1em] opacity-70">
                              Ignorés
                            </p>
                          </div>
                        </div>

                        <div className="rounded-3xl border border-[#dbead7]/80 bg-[#f0f8ee]/55 p-4">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <h3 className="text-sm font-bold tracking-[-0.02em] text-[#4f755b]">
                              Événements reconnus
                            </h3>
                            <span className="rounded-full border border-[#dbead7]/80 bg-white/60 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#5f7f68]">
                              Reconnu
                            </span>
                          </div>
                          {!syncResult.recognizedEvents.length ? (
                            <p className="mt-4 text-sm font-medium text-black/45">
                              Aucun événement reconnu sur cette synchronisation.
                            </p>
                          ) : (
                            <div className="mt-4 space-y-3">
                              {syncResult.recognizedEvents.map((event) => (
                                <div
                                  key={`recognized-${eventKey(event)}`}
                                  className="rounded-2xl border border-white/70 bg-white/55 p-4"
                                >
                                  <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                      <p className="font-semibold tracking-[-0.02em]">
                                        {event.summary || "Sans titre"}
                                      </p>
                                      <p className="mt-1 text-xs font-medium text-black/45">
                                        {formatDate(event.startsAt)} -{" "}
                                        {formatDate(event.endsAt)}
                                      </p>
                                      <p className="mt-2 text-xs font-semibold text-black/55">
                                        Patient : {event.patientName || "Non renseigné"}
                                      </p>
                                      <p className="mt-2 text-xs font-medium leading-5 text-black/45">
                                        {event.reason}
                                      </p>
                                    </div>
                                    <span
                                      className={cn(
                                        "rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.1em]",
                                        confidenceTone(event.confidence)
                                      )}
                                    >
                                      {confidencePercent(event.confidence)}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="rounded-3xl border border-[#eadfca]/80 bg-[#fff7e6]/60 p-4">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <h3 className="text-sm font-bold tracking-[-0.02em] text-[#7b6745]">
                              Validation nécessaire
                            </h3>
                            <span className="rounded-full border border-[#eadfca]/80 bg-white/60 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#7b6745]">
                              Validation nécessaire
                            </span>
                          </div>
                          {!syncResult.unmatchedEvents.length ? (
                            <p className="mt-4 text-sm font-medium text-black/45">
                              Aucun événement à valider.
                            </p>
                          ) : (
                            <div className="mt-4 space-y-3">
                              {syncResult.unmatchedEvents.map((event) => {
                                const key = `${connection.id}:${eventKey(event)}`;
                                const draft =
                                  newPatientByEvent[key] ||
                                  newPatientDraftFromEvent(event);
                                const isNewPatientOpen =
                                  newPatientOpenByEvent[key] || false;

                                return (
                                  <div
                                    key={`unmatched-${eventKey(event)}`}
                                    className="rounded-2xl border border-white/70 bg-white/55 p-4"
                                  >
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                      <div>
                                        <p className="font-semibold tracking-[-0.02em]">
                                          {event.summary || "Sans titre"}
                                        </p>
                                        <p className="mt-1 text-xs font-medium text-black/45">
                                          {formatDate(event.startsAt)} -{" "}
                                          {formatDate(event.endsAt)}
                                        </p>
                                        <p className="mt-2 text-xs font-medium leading-5 text-black/45">
                                          {event.reason}
                                        </p>
                                      </div>
                                      <span
                                        className={cn(
                                          "rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.1em]",
                                          confidenceTone(event.confidence)
                                        )}
                                      >
                                        {confidencePercent(event.confidence)}
                                      </span>
                                    </div>
                                    <div className="mt-4 rounded-3xl border border-white/70 bg-white/50 p-3">
                                      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-black/40">
                                        Patient existant
                                      </p>
                                      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                                        <select
                                          value={selectedPatientByEvent[key] || ""}
                                          onChange={(inputEvent) =>
                                            setSelectedPatientByEvent((current) => ({
                                              ...current,
                                              [key]: inputEvent.target.value,
                                            }))
                                          }
                                          className={INPUT}
                                        >
                                          <option value="">Choisir un patient</option>
                                          {patients.map((patient) => (
                                            <option key={patient.id} value={patient.id}>
                                              {patientName(patient)}
                                            </option>
                                          ))}
                                        </select>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleCreateAppointmentFromEvent(
                                              connection,
                                              event
                                            )
                                          }
                                          disabled={creatingAppointmentKey === key}
                                          className={BUTTON_DARK}
                                        >
                                          {creatingAppointmentKey === key
                                            ? "Création..."
                                            : "Créer rendez-vous"}
                                        </button>
                                      </div>
                                    </div>

                                    <div className="mt-3 rounded-3xl border border-cyan-100/70 bg-cyan-50/35 p-3">
                                      <div className="flex flex-wrap items-center justify-between gap-3">
                                        <div>
                                          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-cyan-700/55">
                                            Nouveau patient
                                          </p>
                                          <p className="mt-1 text-xs font-medium text-black/42">
                                            Créer le dossier puis le rendez-vous associé.
                                          </p>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            ensureNewPatientDraft(key, event);
                                            setNewPatientOpenByEvent((current) => ({
                                              ...current,
                                              [key]: !isNewPatientOpen,
                                            }));
                                          }}
                                          className={BUTTON_LIGHT}
                                        >
                                          {isNewPatientOpen
                                            ? "Masquer"
                                            : "Nouveau patient"}
                                        </button>
                                      </div>

                                      {isNewPatientOpen && (
                                        <div className="mt-4 space-y-3">
                                          <div className="grid gap-3 sm:grid-cols-2">
                                            <label className="block">
                                              <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-black/40">
                                                Prénom
                                              </span>
                                              <input
                                                value={draft.firstName}
                                                onChange={(inputEvent) =>
                                                  updateNewPatientDraft(
                                                    key,
                                                    event,
                                                    "firstName",
                                                    inputEvent.target.value
                                                  )
                                                }
                                                className={cn(INPUT, "mt-1.5")}
                                                placeholder="Prénom"
                                              />
                                            </label>
                                            <label className="block">
                                              <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-black/40">
                                                Nom
                                              </span>
                                              <input
                                                value={draft.lastName}
                                                onChange={(inputEvent) =>
                                                  updateNewPatientDraft(
                                                    key,
                                                    event,
                                                    "lastName",
                                                    inputEvent.target.value
                                                  )
                                                }
                                                className={cn(INPUT, "mt-1.5")}
                                                placeholder="Nom"
                                              />
                                            </label>
                                            <label className="block">
                                              <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-black/40">
                                                Téléphone
                                              </span>
                                              <input
                                                value={draft.phone}
                                                onChange={(inputEvent) =>
                                                  updateNewPatientDraft(
                                                    key,
                                                    event,
                                                    "phone",
                                                    inputEvent.target.value
                                                  )
                                                }
                                                className={cn(INPUT, "mt-1.5")}
                                                placeholder="Optionnel"
                                              />
                                            </label>
                                            <label className="block">
                                              <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-black/40">
                                                Email
                                              </span>
                                              <input
                                                type="email"
                                                value={draft.email}
                                                onChange={(inputEvent) =>
                                                  updateNewPatientDraft(
                                                    key,
                                                    event,
                                                    "email",
                                                    inputEvent.target.value
                                                  )
                                                }
                                                className={cn(INPUT, "mt-1.5")}
                                                placeholder="Optionnel"
                                              />
                                            </label>
                                          </div>
                                          <label className="block">
                                            <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-black/40">
                                              Note
                                            </span>
                                            <textarea
                                              value={draft.notes}
                                              onChange={(inputEvent) =>
                                                updateNewPatientDraft(
                                                  key,
                                                  event,
                                                  "notes",
                                                  inputEvent.target.value
                                                )
                                              }
                                              className={cn(INPUT, "mt-1.5 min-h-[78px] resize-none")}
                                              placeholder="Optionnel"
                                            />
                                          </label>
                                          <div className="flex flex-wrap items-center gap-3">
                                            <button
                                              type="button"
                                              onClick={() =>
                                                handleCreatePatientAndAppointmentFromEvent(
                                                  connection,
                                                  event
                                                )
                                              }
                                              disabled={creatingAppointmentKey === key}
                                              className={BUTTON_DARK}
                                            >
                                              {creatingAppointmentKey === key
                                                ? "Création..."
                                                : "Créer patient + rendez-vous"}
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() =>
                                                router.push("/dashboard/appointments")
                                              }
                                              className={BUTTON_LIGHT}
                                            >
                                              Voir les rendez-vous
                                            </button>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        <div className="rounded-3xl border border-[#f3ddd7]/80 bg-[#fff1ed]/55 p-4">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <h3 className="text-sm font-bold tracking-[-0.02em] text-[#9a6657]">
                              Ignorés
                            </h3>
                            <span className="rounded-full border border-[#f3ddd7]/80 bg-white/60 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#9a6657]">
                              Ignoré
                            </span>
                          </div>
                          {!syncResult.skippedEvents.length ? (
                            <p className="mt-4 text-sm font-medium text-black/45">
                              Aucun événement ignoré.
                            </p>
                          ) : (
                            <div className="mt-4 space-y-3">
                              {syncResult.skippedEvents.map((event) => (
                                <div
                                  key={`skipped-${eventKey(event)}`}
                                  className="rounded-2xl border border-white/70 bg-white/55 p-4"
                                >
                                  <p className="font-semibold tracking-[-0.02em]">
                                    {event.summary || "Sans titre"}
                                  </p>
                                  <p className="mt-1 text-xs font-medium text-black/45">
                                    {formatDate(event.startsAt)} -{" "}
                                    {formatDate(event.endsAt)}
                                  </p>
                                  <p className="mt-2 text-xs font-medium leading-5 text-black/45">
                                    {event.reason}
                                  </p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
