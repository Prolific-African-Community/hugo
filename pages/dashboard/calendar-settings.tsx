import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/router";

type CalendarProvider = "APPLE_CALENDAR";
type CalendarConnectionStatus = "CONNECTED" | "DISCONNECTED" | "ERROR";

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
}

interface CalendarConnection {
  id: string;
  entityId: string;
  provider: CalendarProvider;
  name: string;
  calendarUrl: string;
  status: CalendarConnectionStatus;
  lastSyncedAt?: string | null;
  lastError?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CalendarConnectionForm {
  name: string;
  calendarUrl: string;
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

export default function CalendarSettingsPage() {
  const router = useRouter();
  const [connections, setConnections] = useState<CalendarConnection[]>([]);
  const [form, setForm] = useState<CalendarConnectionForm>(emptyForm());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
      throw new Error(payload.message || "Requete impossible");
    }

    return payload.data as T;
  };

  const loadConnections = async () => {
    setError(null);

    try {
      const data = await request<CalendarConnection[]>(
        "/api/hugo/calendar-connections"
      );
      setConnections(data);
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
              onClick={() => router.push("/dashboard/calendar-import")}
              className={BUTTON_LIGHT}
            >
              <Icon name="upload" className="h-3.5 w-3.5 text-cyan-700/60" />
              Import agenda
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
                Apple Calendar
              </p>
              <h1 className="mt-3 text-4xl font-bold tracking-[-0.055em] sm:text-5xl">
                Connexion agenda
              </h1>
              <p className="mt-3 max-w-2xl text-base font-medium leading-7 text-black/48">
                Enregistrez une URL privée .ics. Hugo la stocke pour la future
                synchronisation, sans appeler le calendrier dans ce run.
              </p>
            </div>
            <button
              type="button"
              onClick={() => router.push("/dashboard/calendar-import")}
              className={BUTTON_DARK}
            >
              <Icon name="upload" className="h-3.5 w-3.5" />
              Tester un import
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

        <section className="mt-4 grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
          <form onSubmit={handleSubmit} className={cn(CARD, "overflow-hidden")}>
            <div className="border-b border-black/5 px-5 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-700/60">
                Connecter Apple Calendar
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
            </div>
          </form>

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
                {connections.map((connection) => (
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
