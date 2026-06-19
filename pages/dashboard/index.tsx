import { useEffect, useState } from "react";
import { useRouter } from "next/router";

type PatientStatus = "ACTIVE" | "INACTIVE" | "ARCHIVED";
type PrescriptionStatus = "ACTIVE" | "COMPLETED" | "EXPIRED" | "CANCELLED";
type TherapySessionStatus = "PLANNED" | "COMPLETED" | "CANCELLED" | "MISSED";

interface Cabinet {
  cabinetId: string;
  name: string;
}

interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  status: PatientStatus;
  updatedAt: string;
}

interface Prescription {
  id: string;
  title: string;
  status: PrescriptionStatus;
  prescribedSessions: number;
  completedSessions: number;
  patient?: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
}

interface TherapySession {
  id: string;
  sessionNumber: number;
  scheduledAt?: string | null;
  status: TherapySessionStatus;
  patient?: {
    firstName: string;
    lastName: string;
  } | null;
  prescription?: {
    id: string;
    title: string;
    prescribedSessions: number;
    completedSessions: number;
    status: PrescriptionStatus;
  } | null;
}

interface DashboardMetrics {
  activePatientsCount: number;
  activePrescriptionsCount: number;
  upcomingSessionsCount: number;
  nearlyCompletedPrescriptionsCount: number;
}

interface DashboardPayload {
  cabinet: Cabinet;
  metrics: DashboardMetrics;
  todaySessions: TherapySession[];
  upcomingSessions: TherapySession[];
  nearlyCompletedPrescriptions: Prescription[];
  recentPatients: Patient[];
}

interface BillingReadinessItem {
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

interface BillingReadinessPayload {
  prescriptionsNeedingAttention: BillingReadinessItem[];
  invoiceDraftCandidates: BillingReadinessItem[];
  invoiceReadyCandidates: BillingReadinessItem[];
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
}

type ClassValue = string | false | null | undefined;

const cn = (...classes: ClassValue[]) => classes.filter(Boolean).join(" ");
const PAGE_BG = "bg-[#f7f8f6]";
const CARD =
  "rounded-[1.35rem] border border-white/70 bg-white/68 shadow-[0_18px_55px_rgba(54,69,79,0.055)] backdrop-blur-xl";
const BUTTON_DARK =
  "inline-flex items-center justify-center gap-2 rounded-full bg-[#202522] px-4 py-2.5 text-xs font-semibold text-white shadow-[0_10px_25px_rgba(30,37,34,0.12)] transition-all duration-200 hover:-translate-y-px hover:bg-[#303832] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50";
const BUTTON_LIGHT =
  "inline-flex items-center justify-center gap-2 rounded-full border border-white/70 bg-white/55 px-4 py-2.5 text-xs font-semibold text-black/72 shadow-[0_10px_24px_rgba(54,69,79,0.045)] backdrop-blur-xl transition hover:border-cyan-100 hover:bg-cyan-50/70 hover:text-black disabled:cursor-not-allowed disabled:opacity-50";

type IconName =
  | "grid"
  | "user"
  | "document"
  | "calendar"
  | "receipt"
  | "sun"
  | "clock"
  | "alert"
  | "spark";

function Icon({ name, className = "h-4 w-4" }: { name: IconName; className?: string }) {
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
    sun: (
      <>
        <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" />
        <path d="M12 2v3" />
        <path d="M12 19v3" />
        <path d="M4.9 4.9 7 7" />
        <path d="m17 17 2.1 2.1" />
        <path d="M2 12h3" />
        <path d="M19 12h3" />
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
  };

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
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

function MetricCard({
  label,
  value,
  detail,
  accent,
  icon,
  tone = "bg-cyan-50 text-cyan-700",
}: {
  label: string;
  value: string | number;
  detail: string;
  accent?: boolean;
  icon: IconName;
  tone?: string;
}) {
  return (
    <div className={cn(CARD, "min-h-[150px] p-5")}>
      <div className="flex items-start justify-between gap-4">
        <p className="max-w-[11rem] text-[11px] font-semibold uppercase tracking-[0.12em] text-black/45">
          {label}
        </p>
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
            tone,
            accent && "ring-4 ring-cyan-100/70"
          )}
        >
          <Icon name={icon} className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-7 text-4xl font-bold tracking-[-0.05em]">{value}</p>
      <p className="mt-3 text-sm font-medium leading-6 text-black/50">{detail}</p>
    </div>
  );
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

function patientName(session: TherapySession) {
  if (!session.patient) return "Patient";
  return `${session.patient.firstName} ${session.patient.lastName}`.trim();
}

function readinessPatientName(item: BillingReadinessItem) {
  return `${item.patient.firstName} ${item.patient.lastName}`.trim();
}

function BillingReadinessList({
  empty,
  creatingDraftId,
  items,
  onCreateDraft,
  tone,
}: {
  empty: string;
  creatingDraftId?: string | null;
  items: BillingReadinessItem[];
  onCreateDraft?: (item: BillingReadinessItem) => void;
  tone: string;
}) {
  if (!items.length) {
    return <p className="mt-4 text-sm font-medium text-black/45">{empty}</p>;
  }

  return (
    <div className="mt-4 divide-y divide-black/5">
      {items.slice(0, 5).map((item) => (
        <div key={item.prescription.id} className="py-4 first:pt-0 last:pb-0">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="font-semibold">{readinessPatientName(item)}</p>
              <p className="mt-1 text-sm font-medium text-black/55">
                {item.prescription.title}
              </p>
            </div>
            <span className="w-fit rounded-full bg-[#f4f4f7] px-3 py-1 text-[10px] font-semibold text-black/55">
              {tone}
            </span>
          </div>
          <p className="mt-3 text-xs font-medium text-black/45">
            {item.completedSessions} / {item.prescribedSessions} seances
            realisees · {item.remainingSessions} restante
            {item.remainingSessions > 1 ? "s" : ""}
          </p>
          {onCreateDraft && (
            <button
              type="button"
              onClick={() => onCreateDraft(item)}
              disabled={creatingDraftId === item.prescription.id}
              className={cn(BUTTON_DARK, "mt-3 px-3 py-2")}
            >
              {creatingDraftId === item.prescription.id
                ? "Creation..."
                : "Créer brouillon"}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

export default function WorkspaceDashboard() {
  const router = useRouter();
  const [cabinet, setCabinet] = useState<Cabinet | null>(null);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [todaySessions, setTodaySessions] = useState<TherapySession[]>([]);
  const [upcomingSessions, setUpcomingSessions] = useState<TherapySession[]>([]);
  const [nearlyCompletedPrescriptions, setNearlyCompletedPrescriptions] =
    useState<Prescription[]>([]);
  const [recentPatients, setRecentPatients] = useState<Patient[]>([]);
  const [billingReadiness, setBillingReadiness] =
    useState<BillingReadinessPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creatingDraftId, setCreatingDraftId] = useState<string | null>(null);
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
      throw new Error(payload.message || "Impossible de charger le cockpit");
    }

    return payload.data as T;
  };

  const loadBillingReadiness = async () => {
    const billingData = await request<BillingReadinessPayload>(
      "/api/hugo/billing-readiness"
    );
    setBillingReadiness(billingData);
    return billingData;
  };

  const loadCockpit = async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    setError(null);
    if (showRefresh) setSuccess(null);

    try {
      const [data, billingData] = await Promise.all([
        request<DashboardPayload>("/api/hugo/dashboard"),
        loadBillingReadiness(),
      ]);
      setCabinet(data.cabinet);
      setMetrics(data.metrics);
      setTodaySessions(data.todaySessions);
      setUpcomingSessions(data.upcomingSessions);
      setNearlyCompletedPrescriptions(data.nearlyCompletedPrescriptions);
      setRecentPatients(data.recentPatients);
      setBillingReadiness(billingData);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Impossible de charger le cockpit"
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleCreateDraft = async (item: BillingReadinessItem) => {
    setCreatingDraftId(item.prescription.id);
    setError(null);
    setSuccess(null);

    try {
      await request("/api/hugo/invoices/create-draft", {
        method: "POST",
        body: JSON.stringify({ prescriptionId: item.prescription.id }),
      });
      await loadBillingReadiness();
      setSuccess(
        `Brouillon cree pour ${readinessPatientName(item)} - ${item.prescription.title}.`
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

  useEffect(() => {
    if (!router.isReady) return;
    loadCockpit();
  }, [router.isReady]);

  const entityQuery = cabinet
    ? `?entityId=${encodeURIComponent(cabinet.cabinetId)}`
    : "";

  return (
    <div className={cn(PAGE_BG, "min-h-screen text-black")}>
      <header className="border-b border-white/70 bg-white/45 backdrop-blur-2xl">
        <nav className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-5">
          <LogoMark />
          <div className="flex flex-wrap gap-3">
            <NavButton icon="grid" onClick={() => router.push("/dashboard")}>Cockpit</NavButton>
            <NavButton icon="user" onClick={() => router.push(`/dashboard/patients${entityQuery}`)}>
              Patients
            </NavButton>
            <NavButton
              icon="document"
              onClick={() => router.push(`/dashboard/prescriptions${entityQuery}`)}
            >
              Prescriptions
            </NavButton>
            <NavButton icon="calendar" onClick={() => router.push(`/dashboard/sessions${entityQuery}`)}>
              Séances
            </NavButton>
            <NavButton icon="receipt" onClick={() => router.push(`/dashboard/invoices${entityQuery}`)}>
              Factures
            </NavButton>
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-6 pb-16 pt-8">
        <section className={cn(CARD, "p-6")}>
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-500">
                Cockpit
              </p>
              <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em]">
                Aujourd'hui
              </h1>
              <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-black/50">
                {cabinet?.name || "Cabinet"} - l'essentiel pour garder la
                journee lisible.
              </p>
            </div>

            <button
              type="button"
              onClick={() => loadCockpit(true)}
              disabled={refreshing}
              className={BUTTON_DARK}
            >
              {refreshing ? "Actualisation..." : "Actualiser"}
            </button>
          </div>
        </section>

        {error && (
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
        {!error && success && (
          <section className="mt-4">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-bold text-emerald-700">
              {success}
            </div>
          </section>
        )}

        <section className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Résumé du jour"
            value={loading ? "..." : todaySessions.length}
            detail="seance(s) planifiee(s) aujourd'hui"
            accent
            icon="sun"
            tone="bg-cyan-50 text-cyan-700"
          />
          <MetricCard
            label="Patients actifs"
            value={loading ? "..." : metrics?.activePatientsCount ?? 0}
            detail="patients suivis dans le cabinet"
            icon="user"
            tone="bg-[#eef6ec] text-[#5f7f68]"
          />
          <MetricCard
            label="Prescriptions actives"
            value={loading ? "..." : metrics?.activePrescriptionsCount ?? 0}
            detail="prescriptions encore ouvertes"
            icon="document"
            tone="bg-[#fbf3df] text-[#927341]"
          />
          <MetricCard
            label="Séances à venir"
            value={loading ? "..." : metrics?.upcomingSessionsCount ?? 0}
            detail="prochaines seances a garder en vue"
            icon="clock"
            tone="bg-[#edf7fb] text-[#4f7f92]"
          />
        </section>

        <section className={cn(CARD, "mt-4 overflow-hidden")}>
          <div className="flex flex-col gap-3 border-b border-black/5 px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-500">
                Factures à préparer
              </p>
              <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em]">
                Alertes de facturation
              </h2>
            </div>
            <button
              type="button"
              onClick={() => router.push(`/dashboard/invoices${entityQuery}`)}
              className={BUTTON_LIGHT}
            >
              Voir les factures
            </button>
          </div>

          {loading ? (
            <div className="grid gap-4 p-5 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="h-40 animate-pulse rounded-2xl bg-black/5" />
              ))}
            </div>
          ) : (
            <div className="grid gap-4 p-5 lg:grid-cols-3">
              <div className="rounded-2xl border border-[#eadfca]/70 bg-[#fff8ea]/70 p-4 backdrop-blur-xl">
                <h3 className="flex items-center gap-2 text-sm font-bold tracking-[-0.02em] text-[#7b6745]">
                  <Icon name="alert" className="h-4 w-4" />
                  À surveiller
                </h3>
                <BillingReadinessList
                  empty="Aucune prescription proche de la facturation."
                  items={billingReadiness?.prescriptionsNeedingAttention || []}
                  tone="Bientôt"
                />
              </div>

              <div className="rounded-2xl border border-cyan-100/70 bg-cyan-50/55 p-4 backdrop-blur-xl">
                <h3 className="flex items-center gap-2 text-sm font-bold tracking-[-0.02em] text-cyan-800/75">
                  <Icon name="spark" className="h-4 w-4" />
                  Brouillon suggéré
                </h3>
                <BillingReadinessList
                  empty="Aucun brouillon suggéré pour l'instant."
                  creatingDraftId={creatingDraftId}
                  items={billingReadiness?.invoiceDraftCandidates || []}
                  onCreateDraft={handleCreateDraft}
                  tone="Préparer"
                />
              </div>

              <div className="rounded-2xl border border-[#dbead7]/80 bg-[#f0f8ee]/70 p-4 backdrop-blur-xl">
                <h3 className="flex items-center gap-2 text-sm font-bold tracking-[-0.02em] text-[#5f7f68]">
                  <Icon name="receipt" className="h-4 w-4" />
                  Prête à valider
                </h3>
                <BillingReadinessList
                  empty="Aucune facture prête à valider."
                  items={billingReadiness?.invoiceReadyCandidates || []}
                  tone="Valider"
                />
              </div>
            </div>
          )}
        </section>

        <section className="mt-4 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <div className={cn(CARD, "p-5")}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-500">
              Actions rapides
            </p>
            <div className="mt-5 grid gap-3">
              <button
                type="button"
                onClick={() => router.push(`/dashboard/patients${entityQuery}`)}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-[#dcebd7] bg-[#eef6ec] px-4 py-2.5 text-xs font-semibold text-[#4f755b] shadow-[0_10px_24px_rgba(79,117,91,0.07)] transition hover:-translate-y-px hover:bg-[#e5f1e2]"
              >
                <Icon name="user" className="h-3.5 w-3.5" />
                Ajouter patient
              </button>
              <button
                type="button"
                onClick={() => router.push(`/dashboard/prescriptions${entityQuery}`)}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-[#eadfca] bg-[#fff7e6] px-4 py-2.5 text-xs font-semibold text-[#7b6745] shadow-[0_10px_24px_rgba(123,103,69,0.06)] transition hover:-translate-y-px hover:bg-[#fff2d2]"
              >
                <Icon name="document" className="h-3.5 w-3.5" />
                Ajouter prescription
              </button>
              <button
                type="button"
                onClick={() => router.push(`/dashboard/sessions${entityQuery}`)}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-cyan-100 bg-cyan-50 px-4 py-2.5 text-xs font-semibold text-cyan-800/75 shadow-[0_10px_24px_rgba(14,116,144,0.055)] transition hover:-translate-y-px hover:bg-cyan-100/55"
              >
                <Icon name="calendar" className="h-3.5 w-3.5" />
                Ajouter séance
              </button>
              <button
                type="button"
                onClick={() => router.push(`/dashboard/invoices${entityQuery}`)}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-[#f3ddd7] bg-[#fff1ed] px-4 py-2.5 text-xs font-semibold text-[#9a6657] shadow-[0_10px_24px_rgba(154,102,87,0.055)] transition hover:-translate-y-px hover:bg-[#ffe9e2]"
              >
                <Icon name="receipt" className="h-3.5 w-3.5" />
                Ajouter facture
              </button>
            </div>
            <div className="mt-6 border-t border-black/5 pt-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-black/40">
                Patients récents
              </p>
              {!recentPatients.length ? (
                <p className="mt-4 text-sm font-medium text-black/45">
                  Aucun patient récent.
                </p>
              ) : (
                <div className="mt-4 space-y-3">
                  {recentPatients.map((patient) => (
                    <div
                      key={patient.id}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <span className="font-semibold">
                        {patient.firstName} {patient.lastName}
                      </span>
                      <span className="rounded-full bg-[#f4f4f7] px-2.5 py-1 text-[10px] font-semibold text-black/45">
                        {patient.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className={cn(CARD, "overflow-hidden")}>
            <div className="border-b border-black/5 px-5 py-4">
              <h2 className="text-xl font-semibold tracking-[-0.03em]">
                Prescriptions presque terminées
              </h2>
            </div>
            {!nearlyCompletedPrescriptions.length ? (
              <p className="px-5 py-10 text-sm font-medium text-black/45">
                Rien d'urgent pour le moment.
              </p>
            ) : (
              <div className="divide-y divide-black/5">
                {nearlyCompletedPrescriptions.map((prescription) => {
                  const remaining =
                    prescription.prescribedSessions -
                    prescription.completedSessions;

                  return (
                    <div key={prescription.id} className="px-5 py-4">
                      <p className="font-semibold">{prescription.title}</p>
                      <p className="mt-1 text-xs font-medium text-black/45">
                        {prescription.patient
                          ? `${prescription.patient.firstName} ${prescription.patient.lastName} · `
                          : ""}
                        {remaining} seance{remaining > 1 ? "s" : ""} restante
                        {remaining > 1 ? "s" : ""}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <section className={cn(CARD, "mt-4 overflow-hidden")}>
          <div className="border-b border-black/5 px-5 py-4">
            <h2 className="text-xl font-semibold tracking-[-0.03em]">
              Prochaines séances
            </h2>
          </div>
          {loading ? (
            <div className="px-5 py-10">
              <div className="animate-pulse space-y-3">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="h-14 rounded-2xl bg-black/5" />
                ))}
              </div>
            </div>
          ) : !upcomingSessions.length ? (
            <p className="px-5 py-10 text-sm font-medium text-black/45">
              Aucune seance a venir pour l'instant.
            </p>
          ) : (
            <div className="divide-y divide-black/5">
              {upcomingSessions.map((session) => (
                <div
                  key={session.id}
                  className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-semibold">
                      {patientName(session)} - seance {session.sessionNumber}
                    </p>
                    <p className="mt-1 text-xs font-medium text-black/45">
                      {session.prescription?.title || "Prescription"} ·{" "}
                      {formatSessionDate(session.scheduledAt)}
                    </p>
                  </div>
                  <span className="w-fit rounded-full bg-[#f4f4f7] px-3 py-1 text-[10px] font-semibold text-black/55">
                    {session.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
