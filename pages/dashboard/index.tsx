import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";

interface EntityListItem {
  id: string;
  name: string;
  isActive: boolean;
  documentsCount: number;
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
}

type ClassValue = string | false | null | undefined;

const cn = (...classes: ClassValue[]) => classes.filter(Boolean).join(" ");
const PAGE_BG = "bg-[#ececf1]";
const CARD =
  "rounded-[1.25rem] border border-black/10 bg-white shadow-[0_14px_40px_rgba(15,23,42,0.055)]";
const BUTTON_DARK =
  "inline-flex items-center justify-center rounded-full bg-black px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition-all duration-200 hover:-translate-y-px hover:bg-slate-800 hover:shadow-md active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50";

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

function CockpitCard({
  label,
  value,
  detail,
  accent,
}: {
  label: string;
  value: string | number;
  detail: string;
  accent?: boolean;
}) {
  return (
    <div className={cn(CARD, "min-h-[168px] p-5")}>
      <div className="flex items-start justify-between gap-4">
        <p className="max-w-[10rem] text-[11px] font-semibold uppercase tracking-[0.12em] text-black/45">
          {label}
        </p>
        <span
          className={cn(
            "h-2.5 w-2.5 shrink-0 rounded-full",
            accent ? "bg-blue-500" : "bg-black/10"
          )}
        />
      </div>
      <p className="mt-8 text-4xl font-bold tracking-[-0.05em]">{value}</p>
      <p className="mt-3 text-sm font-medium leading-6 text-black/50">{detail}</p>
    </div>
  );
}

export default function WorkspaceDashboard() {
  const router = useRouter();
  const [cabinets, setCabinets] = useState<EntityListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [canManageUsers, setCanManageUsers] = useState(false);
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
      throw new Error(payload.message || "Impossible de charger le cockpit");
    }

    return payload.data as T;
  };

  const loadCockpit = async (showRefresh = false) => {
    if (showRefresh) {
      setRefreshing(true);
    }

    setError(null);

    try {
      const data = await request<EntityListItem[]>("/api/entities");
      setCabinets(data);
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

  useEffect(() => {
    if (!router.isReady) return;
    loadCockpit();
  }, [router.isReady]);

  useEffect(() => {
    if (!router.isReady) return;

    const role = localStorage.getItem("role");

    if (role === "ADMIN") {
      setCanManageUsers(true);
      return;
    }

    const probeUserManagement = async () => {
      try {
        await request("/api/organization/users");
        setCanManageUsers(true);
      } catch {
        setCanManageUsers(false);
      }
    };

    probeUserManagement();
  }, [router.isReady]);

  const cockpit = useMemo(() => {
    const activeCabinets = cabinets.filter((cabinet) => cabinet.isActive).length;
    const documents = cabinets.reduce(
      (sum, cabinet) => sum + cabinet.documentsCount,
      0
    );

    return {
      appointmentsToday: 0,
      activeClients: activeCabinets,
      sessionsToFollow: documents,
      invoicesToPrepare: 0,
    };
  }, [cabinets]);

  const handleLogout = () => {
    localStorage.clear();
    router.replace("/login");
  };

  return (
    <div className={cn(PAGE_BG, "min-h-screen text-black")}>
      <header className="border-b border-black/5 bg-[#ececf1]/90 backdrop-blur-md">
        <nav className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-5">
          <LogoMark />
          <div className="flex flex-wrap gap-3">
            {canManageUsers && (
              <button
                type="button"
                onClick={() => router.push("/dashboard/users")}
                className="rounded-full border border-black/10 px-4 py-2.5 text-xs font-semibold text-black transition hover:border-black hover:bg-black hover:text-white"
              >
                Acces
              </button>
            )}
            <button
              type="button"
              onClick={() => router.push("/dashboard/patients")}
              className="rounded-full border border-black/10 px-4 py-2.5 text-xs font-semibold text-black transition hover:border-black hover:bg-black hover:text-white"
            >
              Patients
            </button>
            <button
              type="button"
              onClick={() => router.push("/dashboard/prescriptions")}
              className="rounded-full border border-black/10 px-4 py-2.5 text-xs font-semibold text-black transition hover:border-black hover:bg-black hover:text-white"
            >
              Prescriptions
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-full border border-black px-4 py-2 text-xs font-bold text-black transition hover:bg-black hover:text-white"
            >
              Deconnexion
            </button>
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-6 pb-16 pt-8">
        <section className={cn(CARD, "p-6")}>
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-500">
                Cockpit Hugo
              </p>
              <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em]">
                Vue du cabinet
              </h1>
              <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-black/50">
                Un espace temporaire propre pour suivre les priorites du jour,
                les clients, les documents et les prochaines actions.
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
          <section className="mt-4">
            <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-bold text-red-700">
              {error}
            </div>
          </section>
        )}

        <section className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <CockpitCard
            label="Rendez-vous du jour"
            value={loading ? "..." : cockpit.appointmentsToday}
            detail="Planning a connecter lors de la prochaine phase metier."
            accent
          />
          <CockpitCard
            label="Clients actifs"
            value={loading ? "..." : cockpit.activeClients}
            detail="Base existante affichee sous forme de cabinets provisoires."
          />
          <CockpitCard
            label="Seances a suivre"
            value={loading ? "..." : cockpit.sessionsToFollow}
            detail="Indicateur temporaire base sur les documents disponibles."
          />
          <CockpitCard
            label="Factures a preparer"
            value={loading ? "..." : cockpit.invoicesToPrepare}
            detail="Module facture conserve pour une phase ulterieure."
          />
        </section>

        <section className={cn(CARD, "mt-4 overflow-hidden")}>
          <div className="border-b border-black/5 px-6 py-5">
            <h2 className="text-lg font-semibold tracking-[-0.03em]">
              Cabinets disponibles
            </h2>
          </div>

          {loading ? (
            <div className="px-6 py-12">
              <div className="animate-pulse space-y-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="h-12 rounded-2xl bg-black/5" />
                ))}
              </div>
            </div>
          ) : !cabinets.length ? (
            <div className="px-6 py-14 text-center">
              <p className="text-base font-semibold">
                Aucun cabinet disponible pour le moment.
              </p>
              <p className="mt-2 text-sm font-medium text-black/50">
                La creation des donnees metier Hugo viendra dans une phase
                separee.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-black/5">
              {cabinets.map((cabinet) => (
                <div
                  key={cabinet.id}
                  className="flex flex-col gap-4 px-6 py-5 transition hover:bg-black/[0.02] sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-semibold">{cabinet.name}</p>
                    <p className="mt-1 text-xs font-medium text-black/45">
                      {cabinet.documentsCount} document
                      {cabinet.documentsCount > 1 ? "s" : ""} disponible
                      {cabinet.documentsCount > 1 ? "s" : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => router.push(`/dashboard/entity/${cabinet.id}`)}
                    className="w-fit rounded-full border border-black/10 px-3 py-2 text-[10px] font-semibold transition hover:border-black hover:bg-black hover:text-white"
                  >
                    Ouvrir
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
