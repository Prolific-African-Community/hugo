import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";

type AppointmentStatus = "SCHEDULED" | "COMPLETED" | "CANCELLED" | "MISSED";
type AppointmentSource = "MANUAL" | "APPLE_CALENDAR" | "DOCTENA";
type FilterMode = "today" | "week" | "upcoming";

interface Cabinet {
  cabinetId: string;
  name: string;
}

interface Patient {
  id: string;
  firstName: string;
  lastName: string;
}

interface Appointment {
  id: string;
  patientId: string;
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  source: AppointmentSource;
  notes?: string | null;
  patient: Patient;
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
}

interface AppointmentForm {
  patientId: string;
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  source: AppointmentSource;
  notes: string;
}

type ClassValue = string | false | null | undefined;
type IconName = "grid" | "user" | "document" | "calendar" | "receipt" | "clock";

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

const emptyForm = (): AppointmentForm => {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  const end = new Date(start);
  end.setMinutes(end.getMinutes() + 45);

  return {
    patientId: "",
    startsAt: toDateTimeInput(start.toISOString()),
    endsAt: toDateTimeInput(end.toISOString()),
    status: "SCHEDULED",
    source: "MANUAL",
    notes: "",
  };
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

function toDateTimeInput(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offset * 60_000);
  return localDate.toISOString().slice(0, 16);
}

function toIsoDate(value: string) {
  return new Date(value).toISOString();
}

function patientName(patient?: Patient | null) {
  if (!patient) return "Patient";
  return `${patient.firstName} ${patient.lastName}`.trim();
}

function formatDate(value: string) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("fr-LU", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  }).format(date);
}

function formatTime(value: string) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("fr-LU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formFromAppointment(appointment: Appointment): AppointmentForm {
  return {
    patientId: appointment.patientId,
    startsAt: toDateTimeInput(appointment.startsAt),
    endsAt: toDateTimeInput(appointment.endsAt),
    status: appointment.status,
    source: appointment.source,
    notes: appointment.notes || "",
  };
}

export default function AppointmentsDashboardPage() {
  const router = useRouter();
  const [cabinet, setCabinet] = useState<Cabinet | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [filter, setFilter] = useState<FilterMode>("today");
  const [form, setForm] = useState<AppointmentForm>(emptyForm());
  const [editingAppointmentId, setEditingAppointmentId] = useState<string | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingAppointmentId, setDeletingAppointmentId] = useState<string | null>(
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
      throw new Error(payload.message || "Requete impossible");
    }

    return payload.data as T;
  };

  const loadAppointments = async (nextFilter = filter) => {
    const data = await request<Appointment[]>(
      `/api/hugo/appointments?filter=${nextFilter}`
    );
    setAppointments(data);
  };

  const loadInitialData = async () => {
    setLoading(true);
    setError(null);

    try {
      const cabinetData = await request<Cabinet>("/api/hugo/cabinet");
      setCabinet(cabinetData);

      const [patientData, appointmentData] = await Promise.all([
        request<Patient[]>(
          `/api/hugo/patients?entityId=${encodeURIComponent(
            cabinetData.cabinetId
          )}`
        ),
        request<Appointment[]>("/api/hugo/appointments?filter=today"),
      ]);

      setPatients(patientData);
      setAppointments(appointmentData);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Impossible de charger les rendez-vous"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!router.isReady) return;
    loadInitialData();
  }, [router.isReady]);

  const resetForm = () => {
    setForm(emptyForm());
    setEditingAppointmentId(null);
  };

  const handleFilterChange = async (nextFilter: FilterMode) => {
    setFilter(nextFilter);
    setError(null);

    try {
      await loadAppointments(nextFilter);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Impossible de filtrer les rendez-vous"
      );
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    const payload = {
      patientId: form.patientId,
      startsAt: toIsoDate(form.startsAt),
      endsAt: toIsoDate(form.endsAt),
      status: form.status,
      source: form.source,
      notes: form.notes,
    };

    try {
      if (editingAppointmentId) {
        await request<Appointment>(`/api/hugo/appointments/${editingAppointmentId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        setSuccess("Rendez-vous mis a jour.");
      } else {
        await request<Appointment>("/api/hugo/appointments", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setSuccess("Rendez-vous cree.");
      }

      resetForm();
      await loadAppointments();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Impossible d'enregistrer le rendez-vous"
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (appointment: Appointment) => {
    setDeletingAppointmentId(appointment.id);
    setError(null);
    setSuccess(null);

    try {
      await request<{ id: string }>(`/api/hugo/appointments/${appointment.id}`, {
        method: "DELETE",
      });
      setAppointments((current) =>
        current.filter((item) => item.id !== appointment.id)
      );
      if (editingAppointmentId === appointment.id) resetForm();
      setSuccess("Rendez-vous supprime.");
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Impossible de supprimer le rendez-vous"
      );
    } finally {
      setDeletingAppointmentId(null);
    }
  };

  const entityQuery = cabinet
    ? `?entityId=${encodeURIComponent(cabinet.cabinetId)}`
    : "";

  const filterLabel = useMemo(() => {
    if (filter === "today") return "Aujourd'hui";
    if (filter === "week") return "Cette semaine";
    return "À venir";
  }, [filter]);

  return (
    <div className={cn(PAGE_BG, "min-h-screen text-black")}>
      <header className="border-b border-white/70 bg-white/45 backdrop-blur-2xl">
        <nav className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-5">
          <LogoMark />
          <div className="flex flex-wrap gap-3">
            <NavButton icon="grid" onClick={() => router.push("/dashboard")}>
              Cockpit
            </NavButton>
            <NavButton icon="calendar" onClick={() => router.push("/dashboard/appointments")}>
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
              icon="clock"
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
        <section className={cn(CARD, "p-6")}>
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-700/60">
                Agenda interne
              </p>
              <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em]">
                Rendez-vous
              </h1>
              <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-black/50">
                Une couche interne prete a recevoir Apple Calendar et Doctena,
                sans synchronisation externe pour l'instant.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {(["today", "week", "upcoming"] as FilterMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => handleFilterChange(mode)}
                  className={cn(
                    BUTTON_LIGHT,
                    filter === mode && "border-cyan-100 bg-cyan-50 text-cyan-800"
                  )}
                >
                  {mode === "today"
                    ? "Aujourd'hui"
                    : mode === "week"
                    ? "Cette semaine"
                    : "À venir"}
                </button>
              ))}
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

        <section className="mt-4 grid gap-4 xl:grid-cols-[0.88fr_1.2fr]">
          <div className={cn(CARD, "p-5")}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-700/60">
              {editingAppointmentId ? "Edition" : "Nouveau"}
            </p>
            <h2 className="mt-3 text-xl font-semibold tracking-[-0.03em]">
              {editingAppointmentId
                ? "Modifier le rendez-vous"
                : "Ajouter un rendez-vous"}
            </h2>

            <form onSubmit={handleSubmit} className="mt-5 grid gap-4">
              <label>
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                  Patient
                </span>
                <select
                  value={form.patientId}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      patientId: event.target.value,
                    }))
                  }
                  className={INPUT}
                  required
                >
                  <option value="">Choisir un patient</option>
                  {patients.map((patient) => (
                    <option key={patient.id} value={patient.id}>
                      {patientName(patient)}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                    Debut
                  </span>
                  <input
                    type="datetime-local"
                    value={form.startsAt}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        startsAt: event.target.value,
                      }))
                    }
                    className={INPUT}
                    required
                  />
                </label>

                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                    Fin
                  </span>
                  <input
                    type="datetime-local"
                    value={form.endsAt}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        endsAt: event.target.value,
                      }))
                    }
                    className={INPUT}
                    required
                  />
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                    Statut
                  </span>
                  <select
                    value={form.status}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        status: event.target.value as AppointmentStatus,
                      }))
                    }
                    className={INPUT}
                  >
                    {["SCHEDULED", "COMPLETED", "CANCELLED", "MISSED"].map(
                      (status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      )
                    )}
                  </select>
                </label>

                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                    Source
                  </span>
                  <select
                    value={form.source}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        source: event.target.value as AppointmentSource,
                      }))
                    }
                    className={INPUT}
                  >
                    {["MANUAL", "APPLE_CALENDAR", "DOCTENA"].map((source) => (
                      <option key={source} value={source}>
                        {source}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label>
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                  Notes
                </span>
                <textarea
                  value={form.notes}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                  className={cn(INPUT, "min-h-[110px] resize-none")}
                />
              </label>

              <div className="flex flex-wrap gap-3">
                <button type="submit" disabled={saving} className={BUTTON_DARK}>
                  {saving
                    ? "Enregistrement..."
                    : editingAppointmentId
                    ? "Mettre a jour"
                    : "Creer rendez-vous"}
                </button>
                {editingAppointmentId && (
                  <button type="button" onClick={resetForm} className={BUTTON_LIGHT}>
                    Annuler
                  </button>
                )}
              </div>
            </form>
          </div>

          <div className={cn(CARD, "overflow-hidden")}>
            <div className="flex flex-col gap-2 border-b border-black/5 px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-700/60">
                  {filterLabel}
                </p>
                <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em]">
                  Planning
                </h2>
              </div>
              <button
                type="button"
                onClick={() => loadAppointments()}
                className={BUTTON_LIGHT}
              >
                Actualiser
              </button>
            </div>

            {loading ? (
              <div className="space-y-3 p-5">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="h-20 animate-pulse rounded-3xl bg-black/5" />
                ))}
              </div>
            ) : !appointments.length ? (
              <div className="px-5 py-16 text-center">
                <p className="text-lg font-semibold tracking-[-0.03em]">
                  Aucun rendez-vous.
                </p>
                <p className="mt-2 text-sm font-medium text-black/45">
                  Les futures synchronisations alimenteront cette vue.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-black/5">
                {appointments.map((appointment) => (
                  <div
                    key={appointment.id}
                    className="grid gap-4 px-5 py-5 transition hover:bg-white/45 lg:grid-cols-[110px_1fr_auto]"
                  >
                    <div className="rounded-2xl border border-cyan-100/80 bg-cyan-50/60 px-4 py-3 text-center">
                      <p className="text-sm font-bold tracking-[-0.03em] text-cyan-900/75">
                        {formatTime(appointment.startsAt)}
                      </p>
                      <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-900/40">
                        {formatDate(appointment.startsAt)}
                      </p>
                    </div>
                    <div>
                      <p className="text-lg font-semibold tracking-[-0.03em]">
                        {patientName(appointment.patient)}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className="rounded-full border border-white/70 bg-white/65 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-black/48">
                          {appointment.status}
                        </span>
                        <span className="rounded-full border border-[#eadfca]/70 bg-[#fff8ea]/75 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#7b6745]">
                          Source {appointment.source}
                        </span>
                      </div>
                      {appointment.notes && (
                        <p className="mt-3 text-sm font-medium leading-6 text-black/50">
                          {appointment.notes}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap items-start gap-2 lg:justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingAppointmentId(appointment.id);
                          setForm(formFromAppointment(appointment));
                          setError(null);
                          setSuccess(null);
                        }}
                        className={BUTTON_LIGHT}
                      >
                        Modifier
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(appointment)}
                        disabled={deletingAppointmentId === appointment.id}
                        className={BUTTON_LIGHT}
                      >
                        {deletingAppointmentId === appointment.id
                          ? "Suppression..."
                          : "Supprimer"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
