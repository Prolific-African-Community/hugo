import { useEffect, useMemo, useState } from "react";
import type { DragEvent } from "react";
import { useRouter } from "next/router";
import { cleanCalendarNotes } from "../../lib/hugo-display";

type PrescriptionStatus = "ACTIVE" | "COMPLETED" | "EXPIRED" | "CANCELLED";
type TherapySessionStatus = "PLANNED" | "COMPLETED" | "CANCELLED" | "MISSED";
type AppointmentStatus = "SCHEDULED" | "COMPLETED" | "CANCELLED" | "MISSED";
type AppointmentSource = "MANUAL" | "APPLE_CALENDAR" | "DOCTENA";
type BillingActionType = "ATTENTION" | "DRAFT" | "READY";

interface Cabinet {
  cabinetId: string;
  name: string;
  lastAppleCalendarSync?: string | null;
}

interface LinkedSession {
  id: string;
  sessionNumber: number;
  status: TherapySessionStatus;
  prescription: {
    id: string;
    title: string;
    prescribedSessions: number;
    completedSessions: number;
    status: PrescriptionStatus;
  } | null;
}

interface TodayAppointment {
  id: string;
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  source: AppointmentSource;
  notes?: string | null;
  patient: {
    id: string;
    firstName: string;
    lastName: string;
  };
  linkedSessionId: string | null;
  hasSession: boolean;
  linkedSession: LinkedSession | null;
}

interface AgendaDay {
  date: string;
  dayLabel: string;
  dateLabel: string;
  isToday: boolean;
  appointments: TodayAppointment[];
}

interface Prescription {
  id: string;
  patientId: string;
  title: string;
  prescribedSessions: number;
  completedSessions: number;
  status: PrescriptionStatus;
}

interface BillingAction {
  type: BillingActionType;
  patient: {
    id: string;
    firstName: string;
    lastName: string;
  };
  prescription: {
    id: string;
    title: string;
  };
  prescribedSessions: number;
  completedSessions: number;
  remainingSessions: number;
  suggestedAmountCents?: number;
  suggestedCurrency?: string;
  completionDate?: string | null;
}

interface TodaySummary {
  appointmentsToday: number;
  sessionsAlreadyCreatedToday: number;
  appointmentsWithoutSessionToday: number;
  invoicesToPrepare: number;
  invoicesReady: number;
}

interface TodayPayload {
  cabinet: Cabinet;
  selectedDate: string;
  agendaStartDate: string;
  agendaEndDate: string;
  mode: AgendaMode;
  days: number;
  todayAppointments: TodayAppointment[];
  upcomingAppointments: TodayAppointment[];
  agendaDays: AgendaDay[];
  billingActions: BillingAction[];
  summary: TodaySummary;
}

interface AvailabilitySuggestion {
  startsAt: string;
  endsAt: string;
  label: string;
  dayLabel: string;
  isToday: boolean;
  score: number;
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
}

type ClassValue = string | false | null | undefined;
type AgendaMode = "today" | "week";
type IconName =
  | "grid"
  | "user"
  | "document"
  | "calendar"
  | "receipt"
  | "clock"
  | "alert"
  | "spark"
  | "check";

const cn = (...classes: ClassValue[]) => classes.filter(Boolean).join(" ");
const PAGE_BG = "bg-[#f7f8f6]";
const CARD =
  "rounded-[1.35rem] border border-white/70 bg-white/68 shadow-[0_18px_55px_rgba(54,69,79,0.055)] backdrop-blur-xl";
const BUTTON_DARK =
  "inline-flex items-center justify-center gap-2 rounded-full bg-[#202522] px-4 py-2.5 text-xs font-semibold text-white shadow-[0_10px_25px_rgba(30,37,34,0.12)] transition-all duration-200 hover:-translate-y-px hover:bg-[#303832] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50";
const BUTTON_LIGHT =
  "inline-flex items-center justify-center gap-2 rounded-full border border-white/70 bg-white/55 px-4 py-2.5 text-xs font-semibold text-black/72 shadow-[0_10px_24px_rgba(54,69,79,0.045)] backdrop-blur-xl transition hover:border-cyan-100 hover:bg-cyan-50/70 hover:text-black disabled:cursor-not-allowed disabled:opacity-50";
const AGENDA_START_HOUR = 8;
const AGENDA_END_HOUR = 22;
// La journee principale (prioritaire et toujours lisible) va jusqu'a 18:00.
// 18:00 -> 22:00 reste accessible via le scroll interne de la grille.
const AGENDA_PRIORITY_END_HOUR = 18;
const WEEK_SLOT_MINUTES = 30;
// Creneaux un peu plus hauts pour une lecture nette des cards de 30 min.
const WEEK_SLOT_PX = 38;
const WEEK_TOTAL_SLOTS =
  ((AGENDA_END_HOUR - AGENDA_START_HOUR) * 60) / WEEK_SLOT_MINUTES;
const WEEK_GRID_HEIGHT = WEEK_TOTAL_SLOTS * WEEK_SLOT_PX;
const WEEK_VISIBLE_HEIGHT =
  (((AGENDA_PRIORITY_END_HOUR - AGENDA_START_HOUR) * 60) / WEEK_SLOT_MINUTES) *
  WEEK_SLOT_PX;

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
    user: (
      <>
        <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
        <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
      </>
    ),
    document: (
      <>
        <path d="M7 3h7l4 4v14H7z" />
        <path d="M14 3v5h5" />
        <path d="M9.5 13h5" />
        <path d="M9.5 17h4" />
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
    receipt: (
      <>
        <path d="M7 3h10v18l-2-1.2-2 1.2-2-1.2-2 1.2-2-1.2z" />
        <path d="M9.5 8h5" />
        <path d="M9.5 12h5" />
        <path d="M9.5 16h3" />
      </>
    ),
    clock: (
      <>
        <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    alert: (
      <>
        <path d="M12 3 22 20H2z" />
        <path d="M12 9v4" />
        <path d="M12 17h.01" />
      </>
    ),
    spark: (
      <>
        <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
        <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" />
      </>
    ),
    check: (
      <>
        <path d="m5 13 4 4L19 7" />
        <path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z" />
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

function NavButton({
  children,
  icon,
  onClick,
}: {
  children: string;
  icon: IconName;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className={BUTTON_LIGHT}>
      <Icon name={icon} className="h-3.5 w-3.5 text-cyan-700/60" />
      {children}
    </button>
  );
}

function StatPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone: string;
}) {
  return (
    <div className={cn("rounded-2xl border px-3.5 py-2.5 backdrop-blur-xl", tone)}>
      <p className="text-xl font-bold tracking-[-0.04em]">{value}</p>
      <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] opacity-70">
        {label}
      </p>
    </div>
  );
}

function formatTodayDate() {
  return new Intl.DateTimeFormat("fr-LU", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(new Date());
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateInputToDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function addDaysToDateInput(value: string, days: number) {
  const date = dateInputToDate(value);
  date.setDate(date.getDate() + days);
  return toDateInputValue(date);
}

function formatSelectedDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("fr-LU", {
        weekday: "long",
        day: "2-digit",
        month: "long",
      }).format(date);
}

function formatShortDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("fr-LU", {
        day: "2-digit",
        month: "short",
      }).format(date);
}

function formatWeekBoundaryDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("fr-LU", {
        weekday: "long",
        day: "2-digit",
        month: "long",
      }).format(date);
}

function formatAgendaPeriod(data: TodayPayload | null, selectedDate: string) {
  if (data?.mode === "week") {
    return `Semaine du ${formatWeekBoundaryDate(
      data.agendaStartDate
    )} au ${formatWeekBoundaryDate(
      data.agendaEndDate
    )}`;
  }

  return `Aujourd'hui — ${formatSelectedDate(selectedDate)}`;
}

function formatWeekNavigationLabel(data: TodayPayload | null) {
  if (!data) return "Semaine";
  return `${formatShortDate(data.agendaStartDate)} — ${formatShortDate(
    data.agendaEndDate
  )}`;
}

function formatDateTime(value?: string | null) {
  if (!value) return "Jamais";

  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Jamais"
    : new Intl.DateTimeFormat("fr-LU", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
}

function formatAppointmentDate(value?: string | null) {
  if (!value) return "Date à définir";

  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date à définir"
    : new Intl.DateTimeFormat("fr-LU", {
        weekday: "long",
        day: "2-digit",
        month: "long",
      }).format(date);
}

function formatTime(value?: string | null) {
  if (!value) return "--:--";

  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "--:--"
    : new Intl.DateTimeFormat("fr-LU", {
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
}

function formatTimeRange(startsAt?: string | null, endsAt?: string | null) {
  return `${formatTime(startsAt)} - ${formatTime(endsAt)}`;
}

function minutesSinceMidnight(value?: string | null) {
  if (!value) return AGENDA_START_HOUR * 60;

  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? AGENDA_START_HOUR * 60
    : date.getHours() * 60 + date.getMinutes();
}

function weekEventStyle(appointment: TodayAppointment) {
  const dayStartMinutes = AGENDA_START_HOUR * 60;
  const dayEndMinutes = AGENDA_END_HOUR * 60;
  const startsAt = Math.max(
    dayStartMinutes,
    Math.min(dayEndMinutes, minutesSinceMidnight(appointment.startsAt))
  );
  const endsAt = Math.max(
    startsAt + WEEK_SLOT_MINUTES,
    Math.min(dayEndMinutes, minutesSinceMidnight(appointment.endsAt))
  );
  // Hauteur proportionnelle a la duree : 1 creneau = 30 min = WEEK_SLOT_PX.
  const top = ((startsAt - dayStartMinutes) / WEEK_SLOT_MINUTES) * WEEK_SLOT_PX;
  const rawHeight =
    ((endsAt - startsAt) / WEEK_SLOT_MINUTES) * WEEK_SLOT_PX;
  const height = Math.max(rawHeight, WEEK_SLOT_PX);

  return {
    top: `${top}px`,
    // -3px pour laisser un fin interstice entre deux rendez-vous consecutifs.
    height: `${Math.max(height - 3, WEEK_SLOT_PX - 3)}px`,
  };
}

function formatSessionDate(value?: string | null) {
  if (!value) return "Date a definir";

  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date a definir"
    : new Intl.DateTimeFormat("fr-LU", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
}

function patientName(patient?: { firstName: string; lastName: string } | null) {
  if (!patient) return "Patient";
  return `${patient.firstName} ${patient.lastName}`.trim();
}

function sessionStateLabel(appointment: TodayAppointment) {
  if (!appointment.linkedSession) return "Séance non créée";
  if (appointment.linkedSession.status === "COMPLETED") return "Séance réalisée";
  return "Séance prévue";
}

// Libelle ultra-court pour les cards compactes de la vue semaine.
function weekSessionShortLabel(appointment: TodayAppointment) {
  if (!appointment.linkedSession) return "À créer";
  if (appointment.linkedSession.status === "COMPLETED") return "Réalisée";
  return "Prévue";
}

function sessionStateTone(appointment: TodayAppointment) {
  if (!appointment.linkedSession) {
    return "border-[#eadfca]/70 bg-[#fff8ea]/75 text-[#7b6745]";
  }

  if (appointment.linkedSession.status === "COMPLETED") {
    return "border-[#dbead7]/80 bg-[#f0f8ee]/75 text-[#5f7f68]";
  }

  return "border-cyan-100/80 bg-cyan-50/70 text-cyan-800/75";
}

function sourceTone(source: AppointmentSource) {
  if (source === "APPLE_CALENDAR") {
    return "border-cyan-100/80 bg-cyan-50/70 text-cyan-800/70";
  }

  if (source === "DOCTENA") {
    return "border-[#dbead7]/80 bg-[#f0f8ee]/75 text-[#5f7f68]";
  }

  return "border-white/70 bg-white/65 text-black/48";
}

// Fond de la card pilote par le STATUT de la seance (calme, Apple-like).
//  - realisee : vert sage
//  - non creee : champagne / ambre doux
//  - prevue : bleu tres doux
function weekAppointmentTone(appointment: TodayAppointment) {
  if (appointment.linkedSession?.status === "COMPLETED") {
    return "border-[#d3e3cf]/80 bg-[#eef6ec]/85 text-[#4f7359]";
  }

  if (!appointment.hasSession) {
    return "border-[#ecdfc4]/85 bg-[#fdf6e7]/88 text-[#806a44]";
  }

  return "border-[#d2e2ec]/85 bg-[#eef5fa]/88 text-[#3f6981]";
}

// La SOURCE est rendue par un accent de bordure gauche discret.
//  - Apple Calendar : accent bleu froid
//  - Doctena : accent vert doux
//  - Manual : neutre / gris doux
function weekSourceAccent(source: AppointmentSource) {
  if (source === "APPLE_CALENDAR") {
    return "border-l-[3px] border-l-cyan-300/75";
  }

  if (source === "DOCTENA") {
    return "border-l-[3px] border-l-emerald-300/65";
  }

  return "border-l-[3px] border-l-black/15";
}

function actionCopy(action: BillingAction) {
  if (action.type === "READY") {
    return {
      icon: "check" as IconName,
      label: "Facture a valider",
      tone: "border-[#dbead7]/80 bg-[#f0f8ee]/75 text-[#5f7f68]",
      action: "Valider",
    };
  }

  if (action.type === "DRAFT") {
    return {
      icon: "spark" as IconName,
      label: "Facture a preparer",
      tone: "border-cyan-100/80 bg-cyan-50/65 text-cyan-800/75",
      action: "Creer brouillon",
    };
  }

  return {
    icon: "alert" as IconName,
    label: "Prescription bientot terminee",
    tone: "border-[#eadfca]/70 bg-[#fff8ea]/75 text-[#7b6745]",
    action: "Surveiller",
  };
}

export default function TodayDashboard() {
  const router = useRouter();
  const [data, setData] = useState<TodayPayload | null>(null);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creatingDraftId, setCreatingDraftId] = useState<string | null>(null);
  const [creatingSessionAppointmentId, setCreatingSessionAppointmentId] =
    useState<string | null>(null);
  const [agendaMode, setAgendaMode] = useState<AgendaMode>("today");
  const [selectedAgendaDate, setSelectedAgendaDate] = useState(() =>
    toDateInputValue(new Date())
  );
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<
    string | null
  >(null);
  // Mode "Déplacer" du panneau detail : lie a un rendez-vous precis.
  const [rescheduleForAppointmentId, setRescheduleForAppointmentId] = useState<
    string | null
  >(null);
  const [suggestions, setSuggestions] = useState<AvailabilitySuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null);
  const [applyingSlotStart, setApplyingSlotStart] = useState<string | null>(
    null
  );
  // Drag & drop (vue semaine, desktop) — raccourci visuel du meme reschedule.
  const [draggedAppointment, setDraggedAppointment] =
    useState<TodayAppointment | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<{
    dayDate: string;
    slotIndex: number;
    valid: boolean;
  } | null>(null);
  const [dragReschedulePending, setDragReschedulePending] = useState(false);
  const [selectedPrescriptionByAppointment, setSelectedPrescriptionByAppointment] =
    useState<Record<string, string>>({});
  const [completingSessionId, setCompletingSessionId] = useState<string | null>(
    null
  );
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
      throw new Error(payload.message || "Impossible de charger aujourd'hui");
    }

    return payload.data as T;
  };

  const loadToday = async (showRefresh = false, date = selectedAgendaDate) => {
    if (showRefresh) setRefreshing(true);
    setError(null);
    if (showRefresh) setSuccess(null);

    try {
      const days = agendaMode === "today" ? 1 : 6;
      const todayData = await request<TodayPayload>(
        `/api/hugo/today?date=${encodeURIComponent(
          date
        )}&days=${days}&mode=${agendaMode}`
      );
      setData(todayData);

      const prescriptionData = await request<Prescription[]>(
        `/api/hugo/prescriptions?entityId=${encodeURIComponent(
          todayData.cabinet.cabinetId
        )}`
      );
      setPrescriptions(prescriptionData);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Impossible de charger aujourd'hui"
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleCreateDraft = async (action: BillingAction) => {
    setCreatingDraftId(action.prescription.id);
    setError(null);
    setSuccess(null);

    try {
      await request("/api/hugo/invoices/create-draft", {
        method: "POST",
        body: JSON.stringify({ prescriptionId: action.prescription.id }),
      });
      await loadToday();
      setSuccess(
        `Brouillon cree pour ${patientName(action.patient)} - ${action.prescription.title}.`
      );
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Impossible de creer le brouillon"
      );
    } finally {
      setCreatingDraftId(null);
    }
  };

  const activePrescriptionsForPatient = (patientId: string) => {
    return prescriptions.filter(
      (prescription) =>
        prescription.patientId === patientId && prescription.status === "ACTIVE"
    );
  };

  const handleCreateSession = async (appointment: TodayAppointment) => {
    const patientPrescriptions = activePrescriptionsForPatient(
      appointment.patient.id
    );
    const prescriptionId =
      selectedPrescriptionByAppointment[appointment.id] ||
      patientPrescriptions[0]?.id;

    if (!prescriptionId) {
      setError("Aucune prescription active");
      setSuccess(null);
      return;
    }

    setCreatingSessionAppointmentId(appointment.id);
    setError(null);
    setSuccess(null);

    try {
      await request(`/api/hugo/appointments/${appointment.id}/create-session`, {
        method: "POST",
        body: JSON.stringify({ prescriptionId }),
      });
      await loadToday();
      setSuccess(`Séance créée pour ${patientName(appointment.patient)}.`);
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Impossible de créer la séance"
      );
    } finally {
      setCreatingSessionAppointmentId(null);
    }
  };

  const handleCompleteSession = async (appointment: TodayAppointment) => {
    if (!data?.cabinet.cabinetId) {
      setError("Cabinet introuvable.");
      return;
    }

    const session = appointment.linkedSession;

    if (!session) {
      setError("Aucune séance liée à ce rendez-vous.");
      return;
    }

    if (!session.prescription?.id) {
      setError("Prescription introuvable pour cette séance.");
      return;
    }

    setCompletingSessionId(session.id);
    setError(null);
    setSuccess(null);

    try {
      await request(`/api/hugo/sessions/${session.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          entityId: data.cabinet.cabinetId,
          patientId: appointment.patient.id,
          prescriptionId: session.prescription.id,
          sessionNumber: session.sessionNumber,
          status: "COMPLETED",
          completedAt: new Date().toISOString(),
        }),
      });
      await loadToday();
      setSuccess(`Séance réalisée pour ${patientName(appointment.patient)}.`);
    } catch (completeError) {
      setError(
        completeError instanceof Error
          ? completeError.message
          : "Impossible de marquer la séance comme réalisée"
      );
    } finally {
      setCompletingSessionId(null);
    }
  };

  const closeAppointmentPanel = () => {
    setSelectedAppointmentId(null);
    setRescheduleForAppointmentId(null);
    setSuggestions([]);
    setSuggestionsError(null);
  };

  const handleOpenReschedule = async (appointment: TodayAppointment) => {
    setRescheduleForAppointmentId(appointment.id);
    setSuggestions([]);
    setSuggestionsError(null);
    setError(null);
    setSuccess(null);
    setLoadingSuggestions(true);

    const startMs = new Date(appointment.startsAt).getTime();
    const endMs = new Date(appointment.endsAt).getTime();
    const computedDuration = Math.round((endMs - startMs) / 60000);
    const durationMinutes =
      Number.isFinite(computedDuration) && computedDuration >= 15
        ? computedDuration
        : 45;
    // Priorite aux creneaux de la semaine affichee.
    const baseDate =
      data?.agendaStartDate ||
      toDateInputValue(new Date(appointment.startsAt));

    try {
      const params = new URLSearchParams({
        date: baseDate,
        durationMinutes: `${durationMinutes}`,
        days: "7",
        preferredStartHour: `${AGENDA_START_HOUR}`,
        preferredEndHour: `${AGENDA_END_HOUR}`,
      });
      const result = await request<AvailabilitySuggestion[]>(
        `/api/hugo/availability/suggest?${params.toString()}`
      );
      setSuggestions(result.slice(0, 12));
    } catch (suggestError) {
      setSuggestionsError(
        suggestError instanceof Error
          ? suggestError.message
          : "Impossible de charger les créneaux disponibles"
      );
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const handleChooseSlot = async (
    appointment: TodayAppointment,
    slot: AvailabilitySuggestion
  ) => {
    setApplyingSlotStart(slot.startsAt);
    setError(null);
    setSuccess(null);

    try {
      await request(`/api/hugo/appointments/${appointment.id}/reschedule`, {
        method: "PATCH",
        body: JSON.stringify({
          startsAt: slot.startsAt,
          endsAt: slot.endsAt,
        }),
      });
      await loadToday();
      setSuccess("Rendez-vous déplacé.");
      setRescheduleForAppointmentId(null);
      setSuggestions([]);
      setSuggestionsError(null);
    } catch (rescheduleError) {
      setError(
        rescheduleError instanceof Error
          ? rescheduleError.message
          : "Impossible de déplacer le rendez-vous"
      );
    } finally {
      setApplyingSlotStart(null);
    }
  };

  // --- Drag & drop (vue semaine) : meme endpoint reschedule, snap 30 min. ---

  // Duree conservee du rendez-vous (fallback 45 min si invalide).
  const getDraggedDurationMinutes = (appointment: TodayAppointment) => {
    const start = new Date(appointment.startsAt).getTime();
    const end = new Date(appointment.endsAt).getTime();
    const duration = Math.round((end - start) / 60000);
    return Number.isFinite(duration) && duration >= WEEK_SLOT_MINUTES
      ? duration
      : 45;
  };

  // Index de creneau (0..27) a partir de la position verticale du curseur.
  const computeDropSlotIndex = (clientY: number, columnTop: number) => {
    const index = Math.floor((clientY - columnTop) / WEEK_SLOT_PX);
    return Math.max(0, Math.min(WEEK_TOTAL_SLOTS - 1, index));
  };

  const isSlotWithinBounds = (slotIndex: number, durationMinutes: number) => {
    const startMinutes =
      AGENDA_START_HOUR * 60 + slotIndex * WEEK_SLOT_MINUTES;
    return startMinutes + durationMinutes <= AGENDA_END_HOUR * 60;
  };

  const handleAppointmentDragStart = (
    appointment: TodayAppointment,
    event: DragEvent<HTMLButtonElement>
  ) => {
    setDraggedAppointment(appointment);
    setError(null);
    setSuccess(null);
    event.dataTransfer.effectAllowed = "move";
    try {
      event.dataTransfer.setData("text/plain", appointment.id);
    } catch {
      // certains navigateurs restreignent setData : sans impact sur le drop.
    }
  };

  const handleAppointmentDragEnd = () => {
    setDraggedAppointment(null);
    setDragOverSlot(null);
  };

  const handleDayDragOver = (
    day: AgendaDay,
    event: DragEvent<HTMLDivElement>
  ) => {
    if (!draggedAppointment) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";

    const rect = event.currentTarget.getBoundingClientRect();
    const slotIndex = computeDropSlotIndex(event.clientY, rect.top);
    const valid = isSlotWithinBounds(
      slotIndex,
      getDraggedDurationMinutes(draggedAppointment)
    );

    setDragOverSlot((current) =>
      current &&
      current.dayDate === day.date &&
      current.slotIndex === slotIndex &&
      current.valid === valid
        ? current
        : { dayDate: day.date, slotIndex, valid }
    );
  };

  const performDragReschedule = async (
    appointment: TodayAppointment,
    dayDate: string,
    slotIndex: number
  ) => {
    const durationMinutes = getDraggedDurationMinutes(appointment);
    const startMinutes =
      AGENDA_START_HOUR * 60 + slotIndex * WEEK_SLOT_MINUTES;

    if (startMinutes + durationMinutes > AGENDA_END_HOUR * 60) {
      setError("Déplacement impossible : le rendez-vous dépasserait 22:00.");
      return;
    }

    const [year, month, dayOfMonth] = dayDate.split("-").map(Number);
    const newStart = new Date(
      year,
      month - 1,
      dayOfMonth,
      Math.floor(startMinutes / 60),
      startMinutes % 60,
      0,
      0
    );
    const newEnd = new Date(newStart.getTime() + durationMinutes * 60000);

    // Drop sur le meme creneau : aucun appel API.
    if (new Date(appointment.startsAt).getTime() === newStart.getTime()) {
      return;
    }

    setDragReschedulePending(true);
    setError(null);
    setSuccess(null);

    try {
      await request(`/api/hugo/appointments/${appointment.id}/reschedule`, {
        method: "PATCH",
        body: JSON.stringify({
          startsAt: newStart.toISOString(),
          endsAt: newEnd.toISOString(),
        }),
      });
      await loadToday();
      setSuccess("Rendez-vous déplacé.");
    } catch (dragError) {
      const message = dragError instanceof Error ? dragError.message : "";
      // Pas d'update optimiste : en cas d'erreur la card reste a sa place.
      setError(
        message.includes("plage horaire")
          ? "Un rendez-vous existe déjà sur cette plage horaire."
          : "Déplacement impossible."
      );
    } finally {
      setDragReschedulePending(false);
    }
  };

  const handleDayDrop = async (
    day: AgendaDay,
    event: DragEvent<HTMLDivElement>
  ) => {
    if (!draggedAppointment) return;
    event.preventDefault();

    const appointment = draggedAppointment;
    const rect = event.currentTarget.getBoundingClientRect();
    const slotIndex = computeDropSlotIndex(event.clientY, rect.top);

    setDraggedAppointment(null);
    setDragOverSlot(null);
    await performDragReschedule(appointment, day.date, slotIndex);
  };

  useEffect(() => {
    if (!router.isReady) return;
    loadToday();
  }, [router.isReady, agendaMode]);

  // Fermeture du panneau detail au clavier (Escape).
  useEffect(() => {
    if (!selectedAppointmentId) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeAppointmentPanel();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedAppointmentId]);

  const handleAgendaDateChange = async (date: string) => {
    setSelectedAgendaDate(date);
    await loadToday(true, date);
  };

  const handleWeekShift = async (days: number) => {
    const nextDate = addDaysToDateInput(selectedAgendaDate, days);
    setSelectedAgendaDate(nextDate);
    await loadToday(true, nextDate);
  };

  const handleCurrentWeek = async () => {
    const today = toDateInputValue(new Date());
    setSelectedAgendaDate(today);
    await loadToday(true, today);
  };

  const entityQuery = data?.cabinet
    ? `?entityId=${encodeURIComponent(data.cabinet.cabinetId)}`
    : "";

  const importantActions = useMemo(
    () => (data?.billingActions || []).slice(0, 8),
    [data?.billingActions]
  );

  const visibleAgendaDays = useMemo(() => {
    const days = data?.agendaDays || [];
    return agendaMode === "today" ? days.slice(0, 1) : days.slice(0, 6);
  }, [agendaMode, data?.agendaDays]);

  const visibleAppointmentCount = useMemo(
    () =>
      visibleAgendaDays.reduce(
        (total, day) => total + day.appointments.length,
        0
      ),
    [visibleAgendaDays]
  );

  // Le rendez-vous selectionne est resolu par id depuis les donnees fraiches :
  // s'il n'existe plus apres un refresh, le panneau se ferme proprement.
  const selectedAppointment = useMemo(() => {
    if (!selectedAppointmentId) return null;
    for (const day of data?.agendaDays || []) {
      const found = day.appointments.find(
        (appointment) => appointment.id === selectedAppointmentId
      );
      if (found) return found;
    }
    return null;
  }, [data?.agendaDays, selectedAppointmentId]);

  const todayAppointments = data?.agendaDays?.[0]?.appointments || [];
  const sessionsToDoToday = todayAppointments.filter(
    (appointment) =>
      appointment.linkedSession &&
      appointment.linkedSession.status !== "COMPLETED"
  ).length;
  const completedSessionsToday = todayAppointments.filter(
    (appointment) => appointment.linkedSession?.status === "COMPLETED"
  ).length;
  const agendaPeriodLabel = formatAgendaPeriod(data, selectedAgendaDate);
  const hasWeekAppointments = visibleAppointmentCount > 0;
  // Lignes de la grille semaine, une tous les 30 min (08:00 -> 22:00 inclus).
  const agendaSlotLines = Array.from(
    { length: WEEK_TOTAL_SLOTS + 1 },
    (_, index) => {
      const minutes = AGENDA_START_HOUR * 60 + index * WEEK_SLOT_MINUTES;
      const hour = Math.floor(minutes / 60);
      const minute = minutes % 60;
      return {
        index,
        isHour: minute === 0,
        top: index * WEEK_SLOT_PX,
        label: `${`${hour}`.padStart(2, "0")}:${`${minute}`.padStart(2, "0")}`,
      };
    }
  );

  const renderDetailedAppointment = (appointment: TodayAppointment) => {
    const linkedSession = appointment.linkedSession;
    const canCompleteSession = Boolean(
      linkedSession && linkedSession.status !== "COMPLETED"
    );
    const patientPrescriptions = activePrescriptionsForPatient(
      appointment.patient.id
    );
    const selectedPrescriptionId =
      selectedPrescriptionByAppointment[appointment.id] ||
      patientPrescriptions[0]?.id ||
      "";
    const visibleNotes = cleanCalendarNotes(appointment.notes);

    return (
      <article
        key={appointment.id}
        className="rounded-3xl border border-white/70 bg-white/65 p-4 shadow-[0_14px_34px_rgba(54,69,79,0.045)] backdrop-blur-xl transition hover:-translate-y-px hover:bg-white/80"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-bold tracking-[-0.02em] text-cyan-900/75">
              {formatTimeRange(appointment.startsAt, appointment.endsAt)}
            </p>
            <h3 className="mt-2 text-lg font-semibold tracking-[-0.035em]">
              {patientName(appointment.patient)}
            </h3>
          </div>
          <div className="flex flex-wrap gap-2 sm:justify-end">
            <span
              className={cn(
                "rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.1em]",
                sourceTone(appointment.source)
              )}
            >
              {appointment.source}
            </span>
            <span className="rounded-full border border-white/70 bg-white/65 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-black/48">
              {appointment.status}
            </span>
            <span
              className={cn(
                "rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.1em]",
                sessionStateTone(appointment)
              )}
            >
              {sessionStateLabel(appointment)}
            </span>
          </div>
        </div>

        {linkedSession?.prescription && (
          <div className="mt-4 rounded-2xl border border-cyan-100/70 bg-cyan-50/45 px-3 py-2">
            <p className="text-xs font-semibold text-cyan-950/70">
              {linkedSession.prescription.title}
            </p>
            <p className="mt-1 text-xs font-medium text-black/45">
              Séance n°{linkedSession.sessionNumber} ·{" "}
              {linkedSession.prescription.completedSessions} /{" "}
              {linkedSession.prescription.prescribedSessions} réalisées
            </p>
          </div>
        )}

        {visibleNotes && (
          <p className="mt-3 line-clamp-2 text-xs font-medium leading-5 text-black/42">
            {visibleNotes}
          </p>
        )}

        {!appointment.hasSession && (
          <div className="mt-4 grid gap-2">
            {patientPrescriptions.length > 1 && (
              <select
                value={selectedPrescriptionId}
                onChange={(event) =>
                  setSelectedPrescriptionByAppointment((current) => ({
                    ...current,
                    [appointment.id]: event.target.value,
                  }))
                }
                className="w-full rounded-full border border-white/80 bg-white/65 px-3 py-2 text-xs font-semibold text-black/65 outline-none shadow-[0_10px_24px_rgba(54,69,79,0.035)] backdrop-blur-xl transition focus:border-cyan-200 focus:bg-white/90 focus:ring-4 focus:ring-cyan-100/45"
              >
                {patientPrescriptions.map((prescription) => {
                  const remaining =
                    prescription.prescribedSessions -
                    prescription.completedSessions;

                  return (
                    <option key={prescription.id} value={prescription.id}>
                      {prescription.title} · {remaining} restante
                      {remaining > 1 ? "s" : ""}
                    </option>
                  );
                })}
              </select>
            )}
            {!patientPrescriptions.length && (
              <span className="rounded-full border border-[#eadfca]/70 bg-[#fff8ea]/75 px-3 py-2 text-xs font-semibold text-[#7b6745]">
                Aucune prescription active
              </span>
            )}
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          {!appointment.hasSession && (
            <button
              type="button"
              onClick={() => handleCreateSession(appointment)}
              disabled={
                creatingSessionAppointmentId === appointment.id ||
                !patientPrescriptions.length
              }
              className="inline-flex items-center justify-center gap-2 rounded-full border border-cyan-100/80 bg-cyan-50/70 px-3 py-2 text-xs font-semibold text-cyan-800/75 shadow-[0_10px_24px_rgba(8,145,178,0.045)] transition hover:-translate-y-px hover:bg-cyan-100/60 disabled:cursor-not-allowed disabled:opacity-55"
            >
              <Icon name="calendar" className="h-3.5 w-3.5" />
              {creatingSessionAppointmentId === appointment.id
                ? "Création..."
                : "Créer séance"}
            </button>
          )}
          {canCompleteSession && linkedSession && (
            <button
              type="button"
              onClick={() => handleCompleteSession(appointment)}
              disabled={completingSessionId === linkedSession.id}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-[#dbead7]/80 bg-[#f0f8ee]/75 px-3 py-2 text-xs font-semibold text-[#5f7f68] shadow-[0_10px_24px_rgba(79,117,91,0.055)] transition hover:-translate-y-px hover:bg-[#e6f3e2] disabled:cursor-not-allowed disabled:opacity-55"
            >
              <Icon name="check" className="h-3.5 w-3.5" />
              {completingSessionId === linkedSession.id
                ? "Validation..."
                : "Marquer réalisée"}
            </button>
          )}
          {linkedSession?.status === "COMPLETED" && (
            <span className="inline-flex items-center gap-2 rounded-full border border-[#dbead7]/80 bg-[#f0f8ee]/75 px-3 py-2 text-xs font-semibold text-[#5f7f68]">
              <Icon name="check" className="h-3.5 w-3.5" />
              Réalisée
            </span>
          )}
          <button
            type="button"
            onClick={() => router.push(`/dashboard/patients/${appointment.patient.id}`)}
            className={cn(BUTTON_LIGHT, "px-3 py-2")}
          >
            Voir patient
          </button>
          <button
            type="button"
            onClick={() => router.push("/dashboard/appointments")}
            className={cn(BUTTON_LIGHT, "px-3 py-2")}
          >
            Voir rendez-vous
          </button>
        </div>
      </article>
    );
  };

  return (
    <div className={cn(PAGE_BG, "min-h-screen text-black")}>
      <header className="border-b border-white/70 bg-white/45 backdrop-blur-2xl">
        <nav className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-5">
          <LogoMark />
          <div className="flex flex-wrap gap-3">
            <NavButton icon="grid" onClick={() => router.push("/dashboard")}>
              Cockpit
            </NavButton>
            <NavButton
              icon="calendar"
              onClick={() => router.push("/dashboard/appointments")}
            >
              Rendez-vous
            </NavButton>
            <NavButton
              icon="calendar"
              onClick={() => router.push("/dashboard/calendar-settings")}
            >
              Agenda
            </NavButton>
            <NavButton
              icon="user"
              onClick={() => router.push(`/dashboard/patients${entityQuery}`)}
            >
              Patients
            </NavButton>
            <NavButton
              icon="document"
              onClick={() =>
                router.push(`/dashboard/prescriptions${entityQuery}`)
              }
            >
              Prescriptions
            </NavButton>
            <NavButton
              icon="calendar"
              onClick={() => router.push(`/dashboard/sessions${entityQuery}`)}
            >
              Séances
            </NavButton>
            <NavButton
              icon="receipt"
              onClick={() => router.push(`/dashboard/invoices${entityQuery}`)}
            >
              Factures
            </NavButton>
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-6 pb-16 pt-8">
        <section className={cn(CARD, "relative overflow-hidden p-5 sm:p-6")}>
          <div className="pointer-events-none absolute right-0 top-0 h-44 w-44 rounded-full bg-cyan-100/40 blur-3xl" />
          <div className="pointer-events-none absolute bottom-0 left-1/3 h-32 w-32 rounded-full bg-[#fff0df]/60 blur-3xl" />

          <div className="relative flex flex-col gap-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-700/60">
                  {data?.cabinet.name || "Cabinet Hugo"}
                </p>
                <h1 className="mt-2 text-3xl font-bold tracking-[-0.05em] sm:text-4xl">
                  Cockpit
                </h1>
                <p className="mt-1.5 text-sm font-medium text-black/48">
                  Agenda, séances et actions du cabinet
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-semibold text-black/38">
                  <span className="capitalize">{formatTodayDate()}</span>
                  <span aria-hidden>·</span>
                  <span>Période {formatSelectedDate(selectedAgendaDate)}</span>
                  {data?.cabinet.lastAppleCalendarSync && (
                    <>
                      <span aria-hidden>·</span>
                      <span className="inline-flex items-center gap-1 text-black/32">
                        <Icon
                          name="calendar"
                          className="h-3 w-3 text-cyan-700/45"
                        />
                        Sync Apple{" "}
                        {formatDateTime(data.cabinet.lastAppleCalendarSync)}
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => loadToday(true)}
                  disabled={refreshing}
                  className={cn(BUTTON_DARK, "px-3.5 py-2")}
                >
                  {refreshing ? "Actualisation..." : "Actualiser"}
                </button>
                <button
                  type="button"
                  onClick={() => router.push(`/dashboard/sessions${entityQuery}`)}
                  className={cn(BUTTON_LIGHT, "px-3.5 py-2")}
                >
                  <Icon name="calendar" className="h-3.5 w-3.5" />
                  Ajouter séance
                </button>
                <button
                  type="button"
                  onClick={() => router.push(`/dashboard/invoices${entityQuery}`)}
                  className={cn(BUTTON_LIGHT, "px-3.5 py-2")}
                >
                  <Icon name="receipt" className="h-3.5 w-3.5" />
                  Factures
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <StatPill
                label="Rendez-vous du jour"
                value={loading ? "..." : data?.summary.appointmentsToday ?? 0}
                tone="border-[#dcebd7]/80 bg-[#eef6ec]/80 text-[#4f755b]"
              />
              <StatPill
                label="Séances à réaliser"
                value={loading ? "..." : sessionsToDoToday}
                tone="border-cyan-100/80 bg-cyan-50/70 text-cyan-800/75"
              />
              <StatPill
                label="Réalisées aujourd'hui"
                value={loading ? "..." : completedSessionsToday}
                tone="border-[#eadfca]/80 bg-[#fff7e6]/80 text-[#7b6745]"
              />
              <StatPill
                label="Actions CNS"
                value={
                  loading
                    ? "..."
                    : (data?.summary.invoicesToPrepare ?? 0) +
                      (data?.summary.invoicesReady ?? 0)
                }
                tone="border-[#f3ddd7]/80 bg-[#fff1ed]/80 text-[#9a6657]"
              />
            </div>

            {/* Priorités compactes (ancienne section "Actions importantes" fusionnée) */}
            <div className="rounded-2xl border border-white/65 bg-white/45 p-3 backdrop-blur-xl">
              <div className="flex items-center justify-between gap-3">
                <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9a6657]/75">
                  <Icon name="spark" className="h-3.5 w-3.5" />
                  Priorités
                </p>
                {!loading && importantActions.length > 0 && (
                  <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-semibold text-black/45">
                    {importantActions.length}
                  </span>
                )}
              </div>

              {loading ? (
                <div className="mt-2.5 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <div
                      key={index}
                      className="h-12 animate-pulse rounded-xl bg-black/5"
                    />
                  ))}
                </div>
              ) : !importantActions.length ? (
                <p className="mt-2 text-xs font-medium text-black/40">
                  Rien d'urgent pour le moment.
                </p>
              ) : (
                <div className="mt-2.5 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {importantActions.slice(0, 6).map((action) => {
                    const copy = actionCopy(action);
                    const isDraft = action.type === "DRAFT";
                    const busy = creatingDraftId === action.prescription.id;

                    return (
                      <button
                        key={`${action.type}-${action.prescription.id}`}
                        type="button"
                        onClick={() =>
                          isDraft
                            ? handleCreateDraft(action)
                            : router.push(`/dashboard/invoices${entityQuery}`)
                        }
                        disabled={busy}
                        className={cn(
                          "flex items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-60",
                          copy.tone
                        )}
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/65">
                          <Icon name={copy.icon} className="h-3.5 w-3.5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-semibold tracking-[-0.01em]">
                            {patientName(action.patient)}
                          </span>
                          <span className="block truncate text-[10px] font-medium opacity-70">
                            {copy.label} · {action.remainingSessions} restante
                            {action.remainingSessions > 1 ? "s" : ""}
                          </span>
                        </span>
                        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.08em] opacity-70">
                          {busy ? "..." : isDraft ? "Créer" : "Voir"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
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


        <section className="mt-4">
          <div className={cn(CARD, "overflow-hidden")}>
            <div className="flex flex-col gap-4 border-b border-black/5 px-5 py-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-700/60">
                  Agenda
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">
                  Vue opérationnelle
                </h2>
                <p className="mt-1 text-sm font-semibold text-black/42">
                  {agendaPeriodLabel}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="rounded-full border border-white/70 bg-white/55 p-1 shadow-[0_10px_24px_rgba(54,69,79,0.045)] backdrop-blur-xl">
                  <button
                    type="button"
                    onClick={() => setAgendaMode("today")}
                    className={cn(
                      "rounded-full px-4 py-2 text-xs font-semibold transition",
                      agendaMode === "today"
                        ? "bg-cyan-50 text-cyan-800/80 shadow-sm"
                        : "text-black/45 hover:text-black"
                    )}
                  >
                    Aujourd'hui
                  </button>
                  <button
                    type="button"
                    onClick={() => setAgendaMode("week")}
                    className={cn(
                      "rounded-full px-4 py-2 text-xs font-semibold transition",
                      agendaMode === "week"
                        ? "bg-cyan-50 text-cyan-800/80 shadow-sm"
                        : "text-black/45 hover:text-black"
                    )}
                  >
                    Cette semaine
                  </button>
                </div>
                {agendaMode === "today" ? (
                  <label className="relative inline-flex cursor-pointer items-center gap-2 rounded-full border border-white/70 bg-white/55 px-3 py-2 text-xs font-semibold text-black/55 shadow-[0_10px_24px_rgba(54,69,79,0.045)] backdrop-blur-xl transition hover:border-cyan-100 hover:bg-cyan-50/70 hover:text-black">
                    <Icon name="calendar" className="h-3.5 w-3.5 text-cyan-700/60" />
                    <span className="capitalize">
                      {formatSelectedDate(selectedAgendaDate)}
                    </span>
                    <input
                      type="date"
                      value={selectedAgendaDate}
                      onChange={(event) => handleAgendaDateChange(event.target.value)}
                      className="absolute inset-0 cursor-pointer opacity-0"
                      aria-label="Choisir une date"
                    />
                  </label>
                ) : (
                  <div className="inline-flex items-center gap-1 rounded-full border border-white/70 bg-white/55 p-1 text-xs font-semibold text-black/58 shadow-[0_10px_24px_rgba(54,69,79,0.045)] backdrop-blur-xl">
                    <button
                      type="button"
                      onClick={() => handleWeekShift(-7)}
                      disabled={refreshing}
                      className="flex h-8 w-8 items-center justify-center rounded-full transition hover:bg-cyan-50 hover:text-cyan-800/80 disabled:opacity-45"
                      aria-label="Semaine précédente"
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      onClick={handleCurrentWeek}
                      disabled={refreshing}
                      className="rounded-full px-3 py-2 transition hover:bg-white/70 hover:text-black disabled:opacity-45"
                    >
                      {formatWeekNavigationLabel(data)}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleWeekShift(7)}
                      disabled={refreshing}
                      className="flex h-8 w-8 items-center justify-center rounded-full transition hover:bg-cyan-50 hover:text-cyan-800/80 disabled:opacity-45"
                      aria-label="Semaine suivante"
                    >
                      →
                    </button>
                  </div>
                )}
              </div>
            </div>

            {loading ? (
              <div className="grid gap-4 p-5 lg:grid-cols-4">
                {Array.from({ length: 8 }).map((_, index) => (
                  <div
                    key={index}
                    className="h-32 animate-pulse rounded-3xl bg-black/5"
                  />
                ))}
              </div>
            ) : agendaMode === "today" ? (
              !visibleAppointmentCount ? (
                <div className="px-5 py-16 text-center">
                  <p className="text-lg font-semibold tracking-[-0.03em]">
                    Aucun rendez-vous prévu ce jour.
                  </p>
                  <p className="mt-2 text-sm font-medium text-black/45">
                    L'agenda est libre pour l'instant.
                  </p>
                </div>
              ) : (
                <div className="grid gap-4 p-5">
                  {visibleAgendaDays[0]?.appointments.map(renderDetailedAppointment)}
                </div>
              )
            ) : (
              <div className="p-5">
                {!hasWeekAppointments && (
                  <div className="mb-4 rounded-3xl border border-white/70 bg-white/50 px-5 py-4 text-sm font-semibold text-black/45 backdrop-blur-xl">
                    Aucun rendez-vous prévu cette semaine.
                  </div>
                )}
                <div className="overflow-x-auto pb-2">
                  <div className="min-w-[980px]">
                    {/* En-tetes des jours (lundi -> samedi), hauteur reduite */}
                    <div className="grid grid-cols-[56px_repeat(6,minmax(150px,1fr))] gap-2">
                      <div />
                      {visibleAgendaDays.map((day) => (
                        <div
                          key={day.date}
                          className={cn(
                            "flex items-center justify-between gap-2 rounded-xl border px-3 py-1.5 backdrop-blur-xl",
                            day.isToday
                              ? "border-cyan-200/70 bg-cyan-50/70 ring-1 ring-inset ring-cyan-200/50"
                              : "border-white/70 bg-white/52"
                          )}
                        >
                          <p
                            className={cn(
                              "truncate text-xs font-bold capitalize tracking-[-0.02em]",
                              day.isToday ? "text-cyan-800/85" : "text-black/70"
                            )}
                          >
                            {day.dayLabel}
                          </p>
                          <p className="shrink-0 text-[10px] font-semibold text-black/38">
                            {day.dateLabel}
                          </p>
                        </div>
                      ))}
                    </div>

                    {/* Grille horaire : 08:00 -> 19:00 prioritaire, 19:00 -> 22:00 via scroll interne */}
                    <div
                      className="mt-2 overflow-y-auto overscroll-contain rounded-[1.15rem]"
                      style={{ maxHeight: WEEK_VISIBLE_HEIGHT }}
                    >
                      <div
                        className={cn(
                          "grid grid-cols-[56px_repeat(6,minmax(150px,1fr))] gap-2 transition",
                          dragReschedulePending &&
                            "pointer-events-none opacity-70"
                        )}
                        style={{ height: WEEK_GRID_HEIGHT }}
                      >
                        {/* Colonne des reperes horaires (heures + demi-heures discretes) */}
                        <div className="relative">
                          {agendaSlotLines.map((line) => (
                            <div
                              key={line.index}
                              className={cn(
                                "absolute right-2 text-right tabular-nums",
                                line.isHour
                                  ? "text-[11px] font-semibold text-black/40"
                                  : "text-[9px] font-medium text-black/20"
                              )}
                              style={{
                                top: `${line.top}px`,
                                // Le 1er (08:00) et le dernier (22:00) restent
                                // dans le cadre : pas de clipping au bord.
                                transform:
                                  line.index === 0
                                    ? "translateY(0)"
                                    : line.index === WEEK_TOTAL_SLOTS
                                      ? "translateY(-100%)"
                                      : "translateY(-50%)",
                              }}
                            >
                              {line.label}
                            </div>
                          ))}
                        </div>

                        {visibleAgendaDays.map((day) => (
                          <div
                            key={day.date}
                            onDragOver={(event) => handleDayDragOver(day, event)}
                            onDrop={(event) => handleDayDrop(day, event)}
                            className={cn(
                              "relative overflow-hidden rounded-[1.15rem] border backdrop-blur-xl",
                              day.isToday
                                ? "border-cyan-100/70 bg-cyan-50/16"
                                : "border-white/70 bg-white/30"
                            )}
                          >
                            {/* Creneaux de 30 min : ligne d'heure plus marquee, demi-heure discrete */}
                            {Array.from({ length: WEEK_TOTAL_SLOTS }).map(
                              (_, slotIndex) => (
                                <div
                                  key={slotIndex}
                                  className={cn(
                                    "border-b transition hover:bg-cyan-50/25",
                                    slotIndex % 2 === 1
                                      ? "border-black/[0.08]"
                                      : "border-black/[0.03]"
                                  )}
                                  style={{ height: WEEK_SLOT_PX }}
                                />
                              )
                            )}

                            {/* Apercu du creneau cible pendant le drag */}
                            {draggedAppointment &&
                              dragOverSlot?.dayDate === day.date && (
                                <div
                                  className={cn(
                                    "pointer-events-none absolute left-1 right-1 z-20 rounded-lg border-2 border-dashed transition",
                                    dragOverSlot.valid
                                      ? "border-cyan-300/70 bg-cyan-50/45"
                                      : "border-[#e7b8ad]/80 bg-[#fdece8]/55"
                                  )}
                                  style={{
                                    top: dragOverSlot.slotIndex * WEEK_SLOT_PX,
                                    height:
                                      Math.max(
                                        getDraggedDurationMinutes(
                                          draggedAppointment
                                        ) / WEEK_SLOT_MINUTES,
                                        1
                                      ) * WEEK_SLOT_PX -
                                      3,
                                  }}
                                />
                              )}

                            {day.appointments.map((appointment) => (
                              <button
                                key={appointment.id}
                                type="button"
                                draggable={!dragReschedulePending}
                                onDragStart={(event) =>
                                  handleAppointmentDragStart(appointment, event)
                                }
                                onDragEnd={handleAppointmentDragEnd}
                                onClick={() =>
                                  setSelectedAppointmentId(appointment.id)
                                }
                                className={cn(
                                  "absolute left-1 right-1 flex cursor-grab flex-col overflow-hidden rounded-lg border px-2 py-1 text-left shadow-[0_6px_16px_rgba(54,69,79,0.06)] backdrop-blur-xl transition hover:z-10 hover:shadow-[0_10px_22px_rgba(54,69,79,0.1)] focus:outline-none active:cursor-grabbing",
                                  weekAppointmentTone(appointment),
                                  weekSourceAccent(appointment.source),
                                  selectedAppointmentId === appointment.id &&
                                    "z-10 ring-2 ring-cyan-300/60 ring-offset-1 ring-offset-white/40 shadow-[0_12px_26px_rgba(54,69,79,0.14)]",
                                  // Pendant un drag, les AUTRES cards laissent passer
                                  // les evenements vers la colonne (drop sur creneau
                                  // libre meme s'il est visuellement couvert).
                                  draggedAppointment &&
                                    draggedAppointment.id !== appointment.id &&
                                    "pointer-events-none",
                                  draggedAppointment?.id === appointment.id &&
                                    "opacity-40"
                                )}
                                style={weekEventStyle(appointment)}
                                title={`${formatTimeRange(
                                  appointment.startsAt,
                                  appointment.endsAt
                                )} · ${patientName(
                                  appointment.patient
                                )} · ${weekSessionShortLabel(appointment)}`}
                              >
                                <div className="flex items-center justify-between gap-1.5 leading-none">
                                  {/* L'heure ne se tronque jamais (shrink-0). */}
                                  <span className="shrink-0 whitespace-nowrap text-[11px] font-bold tabular-nums">
                                    {formatTime(appointment.startsAt)}
                                  </span>
                                  <span className="min-w-0 truncate text-[9px] font-semibold uppercase tracking-[0.06em] opacity-70">
                                    {weekSessionShortLabel(appointment)}
                                  </span>
                                </div>
                                <p className="mt-0.5 truncate text-[12.5px] font-bold leading-tight tracking-[-0.02em]">
                                  {patientName(appointment.patient)}
                                </p>
                              </button>
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>

                    <p className="mt-2 px-1 text-[10px] font-medium text-black/30">
                      08:00 — 18:00 prioritaire · faites défiler pour 18:00 — 22:00
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      </main>

      {agendaMode === "week" &&
        selectedAppointment &&
        (() => {
          const appointment = selectedAppointment;
          const linkedSession = appointment.linkedSession;
          const canCompleteSession = Boolean(
            linkedSession && linkedSession.status !== "COMPLETED"
          );
          const patientPrescriptions = activePrescriptionsForPatient(
            appointment.patient.id
          );
          const selectedPrescriptionId =
            selectedPrescriptionByAppointment[appointment.id] ||
            patientPrescriptions[0]?.id ||
            "";
          const visibleNotes = cleanCalendarNotes(appointment.notes);

          return (
            <>
              <div
                role="presentation"
                onClick={closeAppointmentPanel}
                className="fixed inset-0 z-40 bg-black/25 backdrop-blur-[2px] transition lg:bg-black/10"
              />
              <aside
                role="dialog"
                aria-label="Détail du rendez-vous"
                className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-white/70 bg-white/82 shadow-[0_30px_80px_rgba(54,69,79,0.18)] backdrop-blur-2xl"
              >
                <div className="flex items-start justify-between gap-4 border-b border-black/5 px-5 py-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-700/60">
                      Détail rendez-vous
                    </p>
                    <h2 className="mt-2 text-xl font-semibold tracking-[-0.04em]">
                      {patientName(appointment.patient)}
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={closeAppointmentPanel}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/70 bg-white/65 text-black/45 shadow-[0_8px_20px_rgba(54,69,79,0.06)] transition hover:bg-white/90 hover:text-black"
                    aria-label="Fermer le panneau"
                  >
                    ✕
                  </button>
                </div>

                <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
                  <div className="flex flex-wrap gap-2">
                    <span
                      className={cn(
                        "rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.1em]",
                        sourceTone(appointment.source)
                      )}
                    >
                      {appointment.source}
                    </span>
                    <span className="rounded-full border border-white/70 bg-white/65 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-black/48">
                      {appointment.status}
                    </span>
                    <span
                      className={cn(
                        "rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.1em]",
                        sessionStateTone(appointment)
                      )}
                    >
                      {sessionStateLabel(appointment)}
                    </span>
                  </div>

                  <div className="grid gap-2 rounded-2xl border border-white/70 bg-white/55 px-4 py-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-black/70">
                      <Icon
                        name="calendar"
                        className="h-4 w-4 text-cyan-700/55"
                      />
                      <span className="capitalize">
                        {formatAppointmentDate(appointment.startsAt)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm font-semibold text-black/70">
                      <Icon name="clock" className="h-4 w-4 text-cyan-700/55" />
                      <span>
                        {formatTimeRange(
                          appointment.startsAt,
                          appointment.endsAt
                        )}
                      </span>
                    </div>
                  </div>

                  {linkedSession?.prescription && (
                    <div className="rounded-2xl border border-cyan-100/70 bg-cyan-50/45 px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-700/60">
                        Prescription
                      </p>
                      <p className="mt-1 text-sm font-semibold text-cyan-950/75">
                        {linkedSession.prescription.title}
                      </p>
                      <p className="mt-1 text-xs font-medium text-black/45">
                        Séance n°{linkedSession.sessionNumber} ·{" "}
                        {linkedSession.prescription.completedSessions} /{" "}
                        {linkedSession.prescription.prescribedSessions} réalisées
                      </p>
                    </div>
                  )}

                  {visibleNotes && (
                    <div className="rounded-2xl border border-white/70 bg-white/55 px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-black/35">
                        Notes
                      </p>
                      <p className="mt-1 whitespace-pre-line text-xs font-medium leading-5 text-black/55">
                        {visibleNotes}
                      </p>
                    </div>
                  )}

                  {(error || success) && (
                    <div className="space-y-2">
                      {error && (
                        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                          {error}
                        </p>
                      )}
                      {success && (
                        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                          {success}
                        </p>
                      )}
                    </div>
                  )}

                  {!appointment.hasSession && (
                    <div className="grid gap-2">
                      {patientPrescriptions.length > 1 && (
                        <select
                          value={selectedPrescriptionId}
                          onChange={(event) =>
                            setSelectedPrescriptionByAppointment((current) => ({
                              ...current,
                              [appointment.id]: event.target.value,
                            }))
                          }
                          className="w-full rounded-full border border-white/80 bg-white/65 px-3 py-2 text-xs font-semibold text-black/65 outline-none shadow-[0_10px_24px_rgba(54,69,79,0.035)] backdrop-blur-xl transition focus:border-cyan-200 focus:bg-white/90 focus:ring-4 focus:ring-cyan-100/45"
                        >
                          {patientPrescriptions.map((prescription) => {
                            const remaining =
                              prescription.prescribedSessions -
                              prescription.completedSessions;

                            return (
                              <option
                                key={prescription.id}
                                value={prescription.id}
                              >
                                {prescription.title} · {remaining} restante
                                {remaining > 1 ? "s" : ""}
                              </option>
                            );
                          })}
                        </select>
                      )}
                      {!patientPrescriptions.length && (
                        <span className="rounded-full border border-[#eadfca]/70 bg-[#fff8ea]/75 px-3 py-2 text-xs font-semibold text-[#7b6745]">
                          Aucune prescription active
                        </span>
                      )}
                    </div>
                  )}

                  {rescheduleForAppointmentId === appointment.id && (
                    <div className="rounded-2xl border border-white/70 bg-white/55 px-4 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-700/60">
                          Créneaux disponibles
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setRescheduleForAppointmentId(null);
                            setSuggestions([]);
                            setSuggestionsError(null);
                          }}
                          className="text-[11px] font-semibold text-black/40 transition hover:text-black/70"
                        >
                          Annuler
                        </button>
                      </div>

                      {loadingSuggestions ? (
                        <p className="mt-3 text-xs font-medium text-black/45">
                          Recherche de créneaux libres...
                        </p>
                      ) : suggestionsError ? (
                        <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                          {suggestionsError}
                        </p>
                      ) : !suggestions.length ? (
                        <p className="mt-3 text-xs font-medium text-black/45">
                          Aucun créneau libre trouvé sur cette période.
                        </p>
                      ) : (
                        <div className="mt-3 grid gap-2">
                          {suggestions.map((slot) => (
                            <div
                              key={slot.startsAt}
                              className="flex items-center justify-between gap-2 rounded-xl border border-white/70 bg-white/65 px-3 py-2"
                            >
                              <p className="min-w-0 truncate text-xs font-semibold capitalize text-black/70">
                                {slot.label}
                              </p>
                              <div className="flex shrink-0 items-center gap-2">
                                <span className="rounded-full border border-[#dbead7]/80 bg-[#f0f8ee]/75 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-[#5f7f68]">
                                  Disponible
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleChooseSlot(appointment, slot)
                                  }
                                  disabled={applyingSlotStart === slot.startsAt}
                                  className="rounded-full bg-[#202522] px-3 py-1 text-[11px] font-semibold text-white shadow-[0_8px_18px_rgba(30,37,34,0.14)] transition hover:bg-[#303832] disabled:cursor-not-allowed disabled:opacity-55"
                                >
                                  {applyingSlotStart === slot.startsAt
                                    ? "..."
                                    : "Choisir"}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="border-t border-black/5 px-5 py-4">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleOpenReschedule(appointment)}
                      className={cn(
                        "inline-flex items-center justify-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold shadow-[0_10px_24px_rgba(54,69,79,0.045)] transition hover:-translate-y-px",
                        rescheduleForAppointmentId === appointment.id
                          ? "border-cyan-100/80 bg-cyan-50/70 text-cyan-800/75"
                          : "border-white/70 bg-white/65 text-black/65 hover:bg-white/90"
                      )}
                    >
                      <Icon
                        name="calendar"
                        className="h-3.5 w-3.5 text-cyan-700/60"
                      />
                      Déplacer
                    </button>
                    {!appointment.hasSession && (
                      <button
                        type="button"
                        onClick={() => handleCreateSession(appointment)}
                        disabled={
                          creatingSessionAppointmentId === appointment.id ||
                          !patientPrescriptions.length
                        }
                        className="inline-flex items-center justify-center gap-2 rounded-full border border-cyan-100/80 bg-cyan-50/70 px-3 py-2 text-xs font-semibold text-cyan-800/75 shadow-[0_10px_24px_rgba(8,145,178,0.045)] transition hover:-translate-y-px hover:bg-cyan-100/60 disabled:cursor-not-allowed disabled:opacity-55"
                      >
                        <Icon name="calendar" className="h-3.5 w-3.5" />
                        {creatingSessionAppointmentId === appointment.id
                          ? "Création..."
                          : "Créer séance"}
                      </button>
                    )}
                    {canCompleteSession && linkedSession && (
                      <button
                        type="button"
                        onClick={() => handleCompleteSession(appointment)}
                        disabled={completingSessionId === linkedSession.id}
                        className="inline-flex items-center justify-center gap-2 rounded-full border border-[#dbead7]/80 bg-[#f0f8ee]/75 px-3 py-2 text-xs font-semibold text-[#5f7f68] shadow-[0_10px_24px_rgba(79,117,91,0.055)] transition hover:-translate-y-px hover:bg-[#e6f3e2] disabled:cursor-not-allowed disabled:opacity-55"
                      >
                        <Icon name="check" className="h-3.5 w-3.5" />
                        {completingSessionId === linkedSession.id
                          ? "Validation..."
                          : "Marquer réalisée"}
                      </button>
                    )}
                    {linkedSession?.status === "COMPLETED" && (
                      <span className="inline-flex items-center gap-2 rounded-full border border-[#dbead7]/80 bg-[#f0f8ee]/75 px-3 py-2 text-xs font-semibold text-[#5f7f68]">
                        <Icon name="check" className="h-3.5 w-3.5" />
                        Réalisée
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        router.push(
                          `/dashboard/patients/${appointment.patient.id}`
                        )
                      }
                      className={cn(BUTTON_LIGHT, "px-3 py-2")}
                    >
                      Voir patient
                    </button>
                    <button
                      type="button"
                      onClick={() => router.push("/dashboard/appointments")}
                      className={cn(BUTTON_LIGHT, "px-3 py-2")}
                    >
                      Voir rendez-vous
                    </button>
                  </div>
                </div>
              </aside>
            </>
          );
        })()}
    </div>
  );
}
