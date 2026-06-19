import { useState } from "react";
import { useRouter } from "next/router";

type AppointmentStatus = "SCHEDULED" | "COMPLETED" | "CANCELLED" | "MISSED";
type AppointmentSource = "MANUAL" | "APPLE_CALENDAR" | "DOCTENA";

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
}

interface ImportedAppointment {
  id: string;
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  source: AppointmentSource;
  notes?: string | null;
  linkedSessionId: string | null;
  hasSession: boolean;
  matchedAutomatically: boolean;
  confidence: number;
  reason: string;
  patient: {
    id: string;
    firstName: string;
    lastName: string;
  };
}

interface UnmatchedEvent {
  externalId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  notes: string;
  reason: string;
  matchedAutomatically?: boolean;
  confidence?: number;
}

interface ImportResult {
  importedCount: number;
  updatedCount: number;
  unmatchedCount: number;
  appointments: ImportedAppointment[];
  unmatchedEvents: UnmatchedEvent[];
}

type ClassValue = string | false | null | undefined;
type IconName = "grid" | "calendar" | "upload";

const cn = (...classes: ClassValue[]) => classes.filter(Boolean).join(" ");
const PAGE_BG = "bg-[#f7f8f6]";
const CARD =
  "rounded-[1.35rem] border border-white/70 bg-white/68 shadow-[0_18px_55px_rgba(54,69,79,0.055)] backdrop-blur-xl";
const BUTTON_DARK =
  "inline-flex items-center justify-center gap-2 rounded-full bg-[#202522] px-4 py-2.5 text-xs font-semibold text-white shadow-[0_10px_25px_rgba(30,37,34,0.12)] transition-all duration-200 hover:-translate-y-px hover:bg-[#303832] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50";
const BUTTON_LIGHT =
  "inline-flex items-center justify-center gap-2 rounded-full border border-white/70 bg-white/55 px-4 py-2.5 text-xs font-semibold text-black/72 shadow-[0_10px_24px_rgba(54,69,79,0.045)] backdrop-blur-xl transition hover:border-cyan-100 hover:bg-cyan-50/70 hover:text-black disabled:cursor-not-allowed disabled:opacity-50";

const createMockPayload = () => {
  const firstStart = new Date();
  firstStart.setHours(9, 0, 0, 0);
  const firstEnd = new Date(firstStart);
  firstEnd.setMinutes(firstEnd.getMinutes() + 45);

  const secondStart = new Date();
  secondStart.setHours(10, 15, 0, 0);
  const secondEnd = new Date(secondStart);
  secondEnd.setMinutes(secondEnd.getMinutes() + 45);

  return JSON.stringify(
    {
      events: [
        {
          externalId: "apple-mock-claire-muller-0900",
          title: "Claire Muller - Kiné",
          startsAt: firstStart.toISOString(),
          endsAt: firstEnd.toISOString(),
          notes: "Import test depuis Apple Calendar",
        },
        {
          externalId: "apple-mock-patient-inconnu-1015",
          title: "Nouveau patient - Kiné",
          startsAt: secondStart.toISOString(),
          endsAt: secondEnd.toISOString(),
          notes: "Patient à rapprocher manuellement",
        },
      ],
    },
    null,
    2
  );
};

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

function patientName(patient: ImportedAppointment["patient"]) {
  return `${patient.firstName} ${patient.lastName}`.trim();
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Date invalide";

  return new Intl.DateTimeFormat("fr-LU", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
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

function StatPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className={cn("rounded-2xl border px-4 py-3 backdrop-blur-xl", tone)}>
      <p className="text-2xl font-bold tracking-[-0.05em]">{value}</p>
      <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] opacity-70">
        {label}
      </p>
    </div>
  );
}

export default function CalendarImportPage() {
  const router = useRouter();
  const [jsonInput, setJsonInput] = useState(createMockPayload);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [importing, setImporting] = useState(false);
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
      throw new Error(payload.message || "Import impossible");
    }

    return payload.data as T;
  };

  const handleImport = async () => {
    setImporting(true);
    setError(null);
    setSuccess(null);

    try {
      const parsed = JSON.parse(jsonInput);
      const importResult = await request<ImportResult>(
        "/api/hugo/calendar-import/mock",
        {
          method: "POST",
          body: JSON.stringify(parsed),
        }
      );

      setResult(importResult);
      setSuccess("Import agenda terminé.");
    } catch (importError) {
      setError(
        importError instanceof Error
          ? importError.message
          : "Impossible d'importer l'agenda"
      );
    } finally {
      setImporting(false);
    }
  };

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
                Agenda externe
              </p>
              <h1 className="mt-3 text-4xl font-bold tracking-[-0.055em] sm:text-5xl">
                Import agenda
              </h1>
              <p className="mt-3 text-base font-medium text-black/48">
                Test d'import Apple Calendar
              </p>
            </div>
            <button
              type="button"
              onClick={handleImport}
              disabled={importing}
              className={BUTTON_DARK}
            >
              <Icon name="upload" className="h-3.5 w-3.5" />
              {importing ? "Import..." : "Importer"}
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

        <section className="mt-4 grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
          <div className={cn(CARD, "overflow-hidden")}>
            <div className="border-b border-black/5 px-5 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-700/60">
                Payload
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">
                JSON de test
              </h2>
            </div>
            <div className="p-5">
              <textarea
                value={jsonInput}
                onChange={(event) => setJsonInput(event.target.value)}
                spellCheck={false}
                className="min-h-[460px] w-full resize-y rounded-3xl border border-white/80 bg-white/65 p-4 font-mono text-xs leading-6 text-black/72 outline-none shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] transition placeholder:text-black/30 focus:border-cyan-200 focus:bg-white/90 focus:ring-4 focus:ring-cyan-100/45"
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className={cn(CARD, "p-5")}>
              <div className="grid gap-3 sm:grid-cols-3">
                <StatPill
                  label="Importés"
                  value={result?.importedCount ?? 0}
                  tone="border-cyan-100/80 bg-cyan-50/70 text-cyan-800/75"
                />
                <StatPill
                  label="Mis à jour"
                  value={result?.updatedCount ?? 0}
                  tone="border-[#dcebd7]/80 bg-[#eef6ec]/80 text-[#4f755b]"
                />
                <StatPill
                  label="Non reconnus"
                  value={result?.unmatchedCount ?? 0}
                  tone="border-[#eadfca]/80 bg-[#fff7e6]/80 text-[#7b6745]"
                />
              </div>
            </div>

            <div className={cn(CARD, "overflow-hidden")}>
              <div className="border-b border-black/5 px-5 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-700/60">
                  Rendez-vous
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">
                  Importés ou mis à jour
                </h2>
              </div>
              {!result?.appointments.length ? (
                <p className="px-5 py-10 text-sm font-medium text-black/45">
                  Aucun rendez-vous importé pour l'instant.
                </p>
              ) : (
                <div className="divide-y divide-black/5">
                  {result.appointments.map((appointment) => (
                    <div
                      key={appointment.id}
                      className="grid gap-4 px-5 py-4 sm:grid-cols-[1fr_auto] sm:items-start"
                    >
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold tracking-[-0.02em]">
                            {patientName(appointment.patient)}
                          </p>
                          <span className="rounded-full border border-[#dbead7]/80 bg-[#f0f8ee]/75 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#5f7f68]">
                            Match automatique
                          </span>
                        </div>
                        <p className="mt-1 text-xs font-medium text-black/45">
                          {formatDateTime(appointment.startsAt)} -{" "}
                          {formatDateTime(appointment.endsAt)}
                        </p>
                        <p className="mt-3 text-xs font-semibold leading-5 text-black/50">
                          {appointment.reason}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 sm:justify-end">
                        <span className="rounded-full border border-cyan-100/80 bg-cyan-50/70 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-cyan-800/70">
                          {appointment.source}
                        </span>
                        <span
                          className={cn(
                            "rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.1em]",
                            confidenceTone(appointment.confidence)
                          )}
                        >
                          {confidencePercent(appointment.confidence)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className={cn(CARD, "overflow-hidden")}>
              <div className="border-b border-black/5 px-5 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7b6745]/70">
                  À identifier
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">
                  Événements non reconnus
                </h2>
              </div>
              {!result?.unmatchedEvents.length ? (
                <p className="px-5 py-10 text-sm font-medium text-black/45">
                  Aucun événement non reconnu.
                </p>
              ) : (
                <div className="divide-y divide-black/5">
                  {result.unmatchedEvents.map((event) => (
                    <div key={event.externalId} className="px-5 py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold tracking-[-0.02em]">
                          {event.title}
                        </p>
                        <span className="rounded-full border border-[#f3ddd7]/80 bg-[#fff1ed]/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#9a6657]">
                          Validation nécessaire
                        </span>
                        <span
                          className={cn(
                            "rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.1em]",
                            confidenceTone(event.confidence)
                          )}
                        >
                          {confidencePercent(event.confidence)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs font-medium text-black/45">
                        {formatDateTime(event.startsAt)} -{" "}
                        {formatDateTime(event.endsAt)}
                      </p>
                      <p className="mt-3 rounded-2xl border border-[#eadfca]/70 bg-[#fff8ea]/75 px-4 py-3 text-xs font-semibold leading-5 text-[#7b6745]">
                        {event.reason}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
