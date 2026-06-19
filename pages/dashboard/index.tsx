import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";

type PrescriptionStatus = "ACTIVE" | "COMPLETED" | "EXPIRED" | "CANCELLED";
type TherapySessionStatus = "PLANNED" | "COMPLETED" | "CANCELLED" | "MISSED";
type BillingActionType = "ATTENTION" | "DRAFT" | "READY";

interface Cabinet {
  cabinetId: string;
  name: string;
}

interface TherapySession {
  id: string;
  sessionNumber: number;
  scheduledAt?: string | null;
  completedAt?: string | null;
  status: TherapySessionStatus;
  patient: {
    id: string;
    firstName: string;
    lastName: string;
  };
  prescription: {
    id: string;
    title: string;
    prescribedSessions: number;
    completedSessions: number;
    status: PrescriptionStatus;
  } | null;
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
  patientsToday: number;
  sessionsToday: number;
  invoicesToPrepare: number;
  invoicesReady: number;
}

interface TodayPayload {
  cabinet: Cabinet;
  todaySessions: TherapySession[];
  upcomingSessions: TherapySession[];
  billingActions: BillingAction[];
  summary: TodaySummary;
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
}

type ClassValue = string | false | null | undefined;
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
    <div className={cn("rounded-2xl border px-4 py-3 backdrop-blur-xl", tone)}>
      <p className="text-2xl font-bold tracking-[-0.05em]">{value}</p>
      <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] opacity-70">
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
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creatingDraftId, setCreatingDraftId] = useState<string | null>(null);
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

  const loadToday = async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    setError(null);
    if (showRefresh) setSuccess(null);

    try {
      const todayData = await request<TodayPayload>("/api/hugo/today");
      setData(todayData);
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

  const handleCompleteSession = async (session: TherapySession) => {
    if (!data?.cabinet.cabinetId) {
      setError("Cabinet introuvable.");
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
          patientId: session.patient.id,
          prescriptionId: session.prescription.id,
          sessionNumber: session.sessionNumber,
          status: "COMPLETED",
          completedAt: new Date().toISOString(),
        }),
      });
      await loadToday();
      setSuccess(`Séance réalisée pour ${patientName(session.patient)}.`);
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

  useEffect(() => {
    if (!router.isReady) return;
    loadToday();
  }, [router.isReady]);

  const entityQuery = data?.cabinet
    ? `?entityId=${encodeURIComponent(data.cabinet.cabinetId)}`
    : "";

  const importantActions = useMemo(
    () => (data?.billingActions || []).slice(0, 8),
    [data?.billingActions]
  );

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
        <section className={cn(CARD, "relative overflow-hidden p-6 sm:p-8")}>
          <div className="pointer-events-none absolute right-0 top-0 h-52 w-52 rounded-full bg-cyan-100/45 blur-3xl" />
          <div className="pointer-events-none absolute bottom-0 left-1/3 h-40 w-40 rounded-full bg-[#fff0df]/70 blur-3xl" />

          <div className="relative flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-700/60">
                {data?.cabinet.name || "Cabinet Hugo"}
              </p>
              <h1 className="mt-3 text-4xl font-bold tracking-[-0.055em] sm:text-5xl">
                Bonjour Hugo
              </h1>
              <p className="mt-3 text-base font-medium capitalize text-black/48">
                {formatTodayDate()}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-4 lg:min-w-[560px]">
              <StatPill
                label="Patients"
                value={loading ? "..." : data?.summary.patientsToday ?? 0}
                tone="border-[#dcebd7]/80 bg-[#eef6ec]/80 text-[#4f755b]"
              />
              <StatPill
                label="Séances"
                value={loading ? "..." : data?.summary.sessionsToday ?? 0}
                tone="border-cyan-100/80 bg-cyan-50/70 text-cyan-800/75"
              />
              <StatPill
                label="À préparer"
                value={loading ? "..." : data?.summary.invoicesToPrepare ?? 0}
                tone="border-[#eadfca]/80 bg-[#fff7e6]/80 text-[#7b6745]"
              />
              <StatPill
                label="À valider"
                value={loading ? "..." : data?.summary.invoicesReady ?? 0}
                tone="border-[#f3ddd7]/80 bg-[#fff1ed]/80 text-[#9a6657]"
              />
            </div>
          </div>

          <div className="relative mt-7 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => loadToday(true)}
              disabled={refreshing}
              className={BUTTON_DARK}
            >
              {refreshing ? "Actualisation..." : "Actualiser"}
            </button>
            <button
              type="button"
              onClick={() => router.push(`/dashboard/sessions${entityQuery}`)}
              className={BUTTON_LIGHT}
            >
              <Icon name="calendar" className="h-3.5 w-3.5" />
              Ajouter séance
            </button>
            <button
              type="button"
              onClick={() => router.push(`/dashboard/invoices${entityQuery}`)}
              className={BUTTON_LIGHT}
            >
              <Icon name="receipt" className="h-3.5 w-3.5" />
              Factures
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

        <section className="mt-4 grid gap-4 xl:grid-cols-[1.28fr_0.72fr]">
          <div className={cn(CARD, "overflow-hidden")}>
            <div className="flex items-end justify-between gap-4 border-b border-black/5 px-5 py-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-700/60">
                  Agenda
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">
                  Patients aujourd'hui
                </h2>
              </div>
              <Icon name="calendar" className="h-5 w-5 text-cyan-700/45" />
            </div>

            {loading ? (
              <div className="space-y-3 p-5">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div
                    key={index}
                    className="h-20 animate-pulse rounded-3xl bg-black/5"
                  />
                ))}
              </div>
            ) : !data?.todaySessions.length ? (
              <div className="px-5 py-16 text-center">
                <p className="text-lg font-semibold tracking-[-0.03em]">
                  Aucun patient prévu aujourd'hui.
                </p>
                <p className="mt-2 text-sm font-medium text-black/45">
                  La journee est libre pour l'instant.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-black/5">
                {data.todaySessions.map((session) => (
                  <div
                    key={session.id}
                    className="grid gap-4 px-5 py-5 transition hover:bg-white/45 sm:grid-cols-[90px_1fr_auto] sm:items-center"
                  >
                    <div className="rounded-2xl border border-cyan-100/80 bg-cyan-50/60 px-4 py-3 text-center text-lg font-bold tracking-[-0.04em] text-cyan-900/75">
                      {formatTime(session.scheduledAt)}
                    </div>
                    <div>
                      <p className="text-lg font-semibold tracking-[-0.03em]">
                        {patientName(session.patient)}
                      </p>
                      <p className="mt-1 text-sm font-medium text-black/45">
                        {session.prescription?.title || "Prescription"} · séance{" "}
                        {session.sessionNumber}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                      <span className="w-fit rounded-full border border-white/70 bg-white/65 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-black/48">
                        {session.status}
                      </span>
                      {session.status !== "COMPLETED" && (
                        <button
                          type="button"
                          onClick={() => handleCompleteSession(session)}
                          disabled={completingSessionId === session.id}
                          className="inline-flex items-center justify-center gap-2 rounded-full border border-[#dbead7]/80 bg-[#f0f8ee]/75 px-3 py-2 text-xs font-semibold text-[#5f7f68] shadow-[0_10px_24px_rgba(79,117,91,0.055)] transition hover:-translate-y-px hover:bg-[#e6f3e2] disabled:cursor-not-allowed disabled:opacity-55"
                        >
                          <Icon name="check" className="h-3.5 w-3.5" />
                          {completingSessionId === session.id
                            ? "Validation..."
                            : "Marquer réalisée"}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className={cn(CARD, "overflow-hidden")}>
            <div className="flex items-end justify-between gap-4 border-b border-black/5 px-5 py-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-700/60">
                  Priorités
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">
                  Actions importantes
                </h2>
              </div>
              <Icon name="spark" className="h-5 w-5 text-[#9a6657]/50" />
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
            ) : !importantActions.length ? (
              <p className="px-5 py-12 text-sm font-medium text-black/45">
                Rien d'urgent pour le moment.
              </p>
            ) : (
              <div className="space-y-3 p-5">
                {importantActions.map((action) => {
                  const copy = actionCopy(action);

                  return (
                    <div
                      key={`${action.type}-${action.prescription.id}`}
                      className={cn("rounded-3xl border p-4", copy.tone)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="flex items-center gap-2 text-sm font-bold tracking-[-0.02em]">
                            <Icon name={copy.icon} className="h-4 w-4" />
                            {copy.label}
                          </p>
                          <p className="mt-3 font-semibold text-black/78">
                            {patientName(action.patient)}
                          </p>
                          <p className="mt-1 text-xs font-medium text-black/45">
                            {action.prescription.title}
                          </p>
                        </div>
                        <span className="rounded-full bg-white/55 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-black/45">
                          {action.remainingSessions} restante
                          {action.remainingSessions > 1 ? "s" : ""}
                        </span>
                      </div>
                      <p className="mt-3 text-xs font-medium text-black/45">
                        {action.completedSessions} / {action.prescribedSessions}{" "}
                        séances réalisées
                      </p>
                      {action.type === "DRAFT" ? (
                        <button
                          type="button"
                          onClick={() => handleCreateDraft(action)}
                          disabled={creatingDraftId === action.prescription.id}
                          className={cn(BUTTON_DARK, "mt-4 px-3 py-2")}
                        >
                          {creatingDraftId === action.prescription.id
                            ? "Creation..."
                            : copy.action}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            router.push(`/dashboard/invoices${entityQuery}`)
                          }
                          className={cn(BUTTON_LIGHT, "mt-4 px-3 py-2")}
                        >
                          {copy.action}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <section className={cn(CARD, "mt-4 overflow-hidden")}>
          <div className="flex items-end justify-between gap-4 border-b border-black/5 px-5 py-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-700/60">
                À venir
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">
                Prochaines séances
              </h2>
            </div>
            <button
              type="button"
              onClick={() => router.push(`/dashboard/sessions${entityQuery}`)}
              className={BUTTON_LIGHT}
            >
              Voir les séances
            </button>
          </div>

          {loading ? (
            <div className="grid gap-3 p-5 md:grid-cols-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  className="h-24 animate-pulse rounded-3xl bg-black/5"
                />
              ))}
            </div>
          ) : !data?.upcomingSessions.length ? (
            <p className="px-5 py-12 text-sm font-medium text-black/45">
              Aucune séance à venir pour l'instant.
            </p>
          ) : (
            <div className="grid gap-3 p-5 md:grid-cols-2">
              {data.upcomingSessions.map((session) => (
                <div
                  key={session.id}
                  className="rounded-3xl border border-white/70 bg-white/50 p-4 backdrop-blur-xl transition hover:bg-white/75"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold tracking-[-0.02em]">
                        {patientName(session.patient)}
                      </p>
                      <p className="mt-1 text-xs font-medium text-black/45">
                        {session.prescription?.title || "Prescription"} · séance{" "}
                        {session.sessionNumber}
                      </p>
                    </div>
                    <span className="rounded-full bg-cyan-50 px-3 py-1 text-[10px] font-semibold text-cyan-800/65">
                      {formatSessionDate(session.scheduledAt)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
