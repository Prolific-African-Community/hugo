import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";

type PatientStatus = "ACTIVE" | "INACTIVE" | "ARCHIVED";
type PrescriptionStatus = "ACTIVE" | "COMPLETED" | "EXPIRED" | "CANCELLED";
type TherapySessionStatus = "PLANNED" | "COMPLETED" | "CANCELLED" | "MISSED";
type InvoiceStatus = "DRAFT" | "READY" | "ISSUED" | "PAID" | "CANCELLED";

interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  cnsNumber?: string | null;
  status: PatientStatus;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Prescription {
  id: string;
  title: string;
  prescribedSessions: number;
  completedSessions: number;
  status: PrescriptionStatus;
  startDate?: string | null;
  endDate?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface TherapySession {
  id: string;
  prescriptionId?: string | null;
  sessionNumber: number;
  scheduledAt?: string | null;
  completedAt?: string | null;
  status: TherapySessionStatus;
  createdAt: string;
  prescription?: {
    id: string;
    title: string;
  } | null;
}

interface Invoice {
  id: string;
  prescriptionId?: string | null;
  invoiceNumber?: string | null;
  status: InvoiceStatus;
  amountCents: number;
  currency: string;
  issuedAt?: string | null;
  dueAt?: string | null;
  paidAt?: string | null;
  createdAt: string;
  prescription?: {
    id: string;
    title: string;
  } | null;
}

interface PatientSummary {
  patient: Patient;
  prescriptions: Prescription[];
  sessions: TherapySession[];
  invoices: Invoice[];
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
  | "check"
  | "clock"
  | "note";

const cn = (...classes: ClassValue[]) => classes.filter(Boolean).join(" ");
const PAGE_BG = "bg-[#f7f8f6]";
const CARD =
  "rounded-[1.35rem] border border-white/70 bg-white/68 shadow-[0_18px_55px_rgba(54,69,79,0.055)] backdrop-blur-xl";
const BUTTON_LIGHT =
  "inline-flex items-center justify-center gap-2 rounded-full border border-white/70 bg-white/55 px-4 py-2.5 text-xs font-semibold text-black/72 shadow-[0_10px_24px_rgba(54,69,79,0.045)] backdrop-blur-xl transition hover:border-cyan-100 hover:bg-cyan-50/70 hover:text-black disabled:cursor-not-allowed disabled:opacity-50";

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
      </>
    ),
    check: (
      <>
        <path d="M20 6 9 17l-5-5" />
      </>
    ),
    clock: (
      <>
        <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    note: (
      <>
        <path d="M6 4h12v16H6z" />
        <path d="M9 8h6" />
        <path d="M9 12h6" />
        <path d="M9 16h4" />
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

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "-"
    : new Intl.DateTimeFormat("fr-LU", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(date);
}

function patientDisplayName(patient: Patient) {
  return `${patient.firstName} ${patient.lastName}`.trim();
}

function amountLabel(invoice: Invoice) {
  return new Intl.NumberFormat("fr-LU", {
    style: "currency",
    currency: invoice.currency || "EUR",
  }).format(invoice.amountCents / 100);
}

function KpiCard({
  detail,
  icon,
  label,
  tone,
  value,
}: {
  detail: string;
  icon: IconName;
  label: string;
  tone: string;
  value: string | number;
}) {
  return (
    <div className={cn(CARD, "p-5")}>
      <div className="flex items-start justify-between gap-4">
        <p className="max-w-[11rem] text-[11px] font-semibold uppercase tracking-[0.12em] text-black/45">
          {label}
        </p>
        <span className={cn("flex h-9 w-9 items-center justify-center rounded-full", tone)}>
          <Icon name={icon} className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-6 text-4xl font-bold tracking-[-0.05em]">{value}</p>
      <p className="mt-2 text-sm font-medium text-black/45">{detail}</p>
    </div>
  );
}

export default function PatientPremiumPage() {
  const router = useRouter();
  const [summary, setSummary] = useState<PatientSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const request = async <T,>(url: string, options: RequestInit = {}) => {
    const token = localStorage.getItem("token");

    if (!token) {
      router.replace("/login");
      throw new Error("Votre session a expire. Veuillez vous reconnecter.");
    }

    const response = await fetch(url, {
      ...options,
      headers: {
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
      throw new Error(payload.message || "Impossible de charger le dossier patient");
    }

    return payload.data as T;
  };

  useEffect(() => {
    if (!router.isReady) return;
    const patientId = typeof router.query.id === "string" ? router.query.id : "";
    if (!patientId) return;

    setLoading(true);
    setError(null);

    request<PatientSummary>(`/api/hugo/patient-summary/${patientId}`)
      .then(setSummary)
      .catch((loadError) =>
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Impossible de charger le dossier patient"
        )
      )
      .finally(() => setLoading(false));
  }, [router.isReady, router.query.id]);

  const activePrescriptions = useMemo(
    () => summary?.prescriptions.filter((prescription) => prescription.status === "ACTIVE") || [],
    [summary]
  );

  const completedSessions = useMemo(
    () => summary?.sessions.filter((session) => session.status === "COMPLETED").length || 0,
    [summary]
  );

  const remainingSessions = useMemo(
    () =>
      activePrescriptions.reduce(
        (total, prescription) =>
          total +
          Math.max(0, prescription.prescribedSessions - prescription.completedSessions),
        0
      ),
    [activePrescriptions]
  );

  const activePrescription = activePrescriptions[0] || summary?.prescriptions[0] || null;

  const timeline = useMemo(() => {
    if (!summary) return [];

    const prescriptionItems = summary.prescriptions.map((prescription) => ({
      id: `prescription-${prescription.id}`,
      date: prescription.createdAt,
      detail: `${prescription.completedSessions} / ${prescription.prescribedSessions} seances`,
      icon: "document" as IconName,
      title: `Prescription creee - ${prescription.title}`,
    }));

    const sessionItems = summary.sessions.map((session) => ({
      id: `session-${session.id}`,
      date: session.completedAt || session.scheduledAt || session.createdAt,
      detail: `${session.status}${session.prescription?.title ? ` - ${session.prescription.title}` : ""}`,
      icon: session.status === "COMPLETED" ? ("check" as IconName) : ("calendar" as IconName),
      title: `Seance ${session.sessionNumber}`,
    }));

    const invoiceItems = summary.invoices.map((invoice) => ({
      id: `invoice-${invoice.id}`,
      date: invoice.paidAt || invoice.issuedAt || invoice.createdAt,
      detail: `${invoice.status} - ${amountLabel(invoice)}`,
      icon: "receipt" as IconName,
      title:
        invoice.status === "DRAFT"
          ? "Facture brouillon"
          : invoice.status === "ISSUED"
          ? "Facture emise"
          : invoice.status === "PAID"
          ? "Facture payee"
          : "Facture",
    }));

    return [...prescriptionItems, ...sessionItems, ...invoiceItems].sort(
      (left, right) => new Date(left.date).getTime() - new Date(right.date).getTime()
    );
  }, [summary]);

  const invoiceCounts = useMemo(() => {
    const invoices = summary?.invoices || [];
    return {
      drafts: invoices.filter((invoice) => invoice.status === "DRAFT").length,
      issued: invoices.filter((invoice) => invoice.status === "ISSUED" || invoice.status === "READY").length,
      paid: invoices.filter((invoice) => invoice.status === "PAID").length,
    };
  }, [summary]);

  return (
    <div className={cn(PAGE_BG, "min-h-screen text-black")}>
      <header className="border-b border-white/70 bg-white/45 backdrop-blur-2xl">
        <nav className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-5">
          <LogoMark />
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => router.push("/dashboard")} className={BUTTON_LIGHT}>
              <Icon name="grid" className="h-3.5 w-3.5 text-cyan-700/60" />
              Cockpit
            </button>
            <button type="button" onClick={() => router.push("/dashboard/patients")} className={BUTTON_LIGHT}>
              <Icon name="user" className="h-3.5 w-3.5 text-cyan-700/60" />
              Patients
            </button>
            <button type="button" onClick={() => router.push("/dashboard/prescriptions")} className={BUTTON_LIGHT}>
              <Icon name="document" className="h-3.5 w-3.5 text-cyan-700/60" />
              Prescriptions
            </button>
            <button type="button" onClick={() => router.push("/dashboard/sessions")} className={BUTTON_LIGHT}>
              <Icon name="calendar" className="h-3.5 w-3.5 text-cyan-700/60" />
              Séances
            </button>
            <button type="button" onClick={() => router.push("/dashboard/invoices")} className={BUTTON_LIGHT}>
              <Icon name="receipt" className="h-3.5 w-3.5 text-cyan-700/60" />
              Factures
            </button>
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-6 pb-16 pt-8">
        {loading ? (
          <div className={cn(CARD, "p-8 text-sm font-semibold text-black/45")}>
            Chargement du dossier patient...
          </div>
        ) : error || !summary ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-bold text-red-700">
            {error || "Dossier patient introuvable."}
          </div>
        ) : (
          <>
            <section className={cn(CARD, "p-6")}>
              <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-700/60">
                    Dossier patient
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <h1 className="text-4xl font-bold tracking-[-0.05em]">
                      {patientDisplayName(summary.patient)}
                    </h1>
                    <span className="rounded-full bg-[#eef6ec] px-3 py-1 text-[10px] font-bold text-[#5f7f68]">
                      {summary.patient.status}
                    </span>
                  </div>
                </div>

                <div className="grid gap-2 text-sm font-semibold text-black/50 sm:grid-cols-3 lg:min-w-[520px]">
                  <span className="rounded-2xl bg-white/55 px-4 py-3">
                    CNS {summary.patient.cnsNumber || "-"}
                  </span>
                  <span className="rounded-2xl bg-white/55 px-4 py-3">
                    {summary.patient.phone || "Telephone manquant"}
                  </span>
                  <span className="rounded-2xl bg-white/55 px-4 py-3">
                    {summary.patient.email || "Email manquant"}
                  </span>
                </div>
              </div>
            </section>

            <section className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <KpiCard
                detail="prescriptions ouvertes"
                icon="document"
                label="Prescriptions actives"
                tone="bg-[#fbf3df] text-[#927341]"
                value={activePrescriptions.length}
              />
              <KpiCard
                detail="seances completees"
                icon="check"
                label="Séances réalisées"
                tone="bg-[#eef6ec] text-[#5f7f68]"
                value={completedSessions}
              />
              <KpiCard
                detail="sur prescriptions actives"
                icon="clock"
                label="Séances restantes"
                tone="bg-[#edf7fb] text-[#4f7f92]"
                value={remainingSessions}
              />
              <KpiCard
                detail="factures rattachees"
                icon="receipt"
                label="Factures"
                tone="bg-[#fff1ed] text-[#9a6657]"
                value={summary.invoices.length}
              />
            </section>

            <section className="mt-4 grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
              <div className={cn(CARD, "overflow-hidden")}>
                <div className="border-b border-white/70 px-5 py-4">
                  <h2 className="text-xl font-semibold tracking-[-0.03em]">
                    Timeline
                  </h2>
                </div>
                {!timeline.length ? (
                  <p className="px-5 py-10 text-sm font-medium text-black/45">
                    Aucun evenement pour ce patient.
                  </p>
                ) : (
                  <div className="px-5 py-5">
                    <div className="space-y-5 border-l border-cyan-100 pl-5">
                      {timeline.map((item) => (
                        <div key={item.id} className="relative">
                          <span className="absolute -left-[33px] flex h-7 w-7 items-center justify-center rounded-full border border-white bg-cyan-50 text-cyan-800/70 shadow-sm">
                            <Icon name={item.icon} className="h-3.5 w-3.5" />
                          </span>
                          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/35">
                            {formatDate(item.date)}
                          </p>
                          <p className="mt-1 font-semibold">{item.title}</p>
                          <p className="mt-1 text-sm font-medium text-black/45">
                            {item.detail}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="grid gap-4">
                <div className={cn(CARD, "p-5")}>
                  <h2 className="text-xl font-semibold tracking-[-0.03em]">
                    Prescription active
                  </h2>
                  {!activePrescription ? (
                    <p className="mt-5 text-sm font-medium text-black/45">
                      Aucune prescription active.
                    </p>
                  ) : (
                    <div className="mt-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">{activePrescription.title}</p>
                          <p className="mt-1 text-xs font-bold text-black/40">
                            {activePrescription.status}
                          </p>
                        </div>
                        <span className="rounded-full bg-cyan-50 px-3 py-1 text-[10px] font-bold text-cyan-800/70">
                          {activePrescription.completedSessions} / {activePrescription.prescribedSessions}
                        </span>
                      </div>
                      <div className="mt-5 h-2 overflow-hidden rounded-full bg-black/5">
                        <div
                          className="h-full rounded-full bg-cyan-200"
                          style={{
                            width: `${Math.min(
                              100,
                              Math.round(
                                (activePrescription.completedSessions /
                                  activePrescription.prescribedSessions) *
                                  100
                              )
                            )}%`,
                          }}
                        />
                      </div>
                      <p className="mt-3 text-sm font-medium text-black/45">
                        {Math.max(
                          0,
                          activePrescription.prescribedSessions -
                            activePrescription.completedSessions
                        )}{" "}
                        seance(s) restante(s)
                      </p>
                    </div>
                  )}
                </div>

                <div className={cn(CARD, "p-5")}>
                  <h2 className="text-xl font-semibold tracking-[-0.03em]">
                    Facturation
                  </h2>
                  <div className="mt-5 grid grid-cols-3 gap-2">
                    {[
                      ["Brouillons", invoiceCounts.drafts, "bg-[#fff1ed] text-[#9a6657]"],
                      ["Emises", invoiceCounts.issued, "bg-[#fbf3df] text-[#927341]"],
                      ["Payees", invoiceCounts.paid, "bg-[#eef6ec] text-[#5f7f68]"],
                    ].map(([label, value, tone]) => (
                      <div key={label} className={cn("rounded-2xl px-3 py-4 text-center", tone as string)}>
                        <p className="text-2xl font-bold tracking-[-0.05em]">
                          {value}
                        </p>
                        <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.1em]">
                          {label}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className={cn(CARD, "p-5")}>
                  <div className="flex items-center gap-2">
                    <Icon name="note" className="h-4 w-4 text-cyan-800/60" />
                    <h2 className="text-xl font-semibold tracking-[-0.03em]">
                      Notes
                    </h2>
                  </div>
                  <p className="mt-4 text-sm font-medium leading-7 text-black/50">
                    {summary.patient.notes || "Aucune note patient pour le moment."}
                  </p>
                </div>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
