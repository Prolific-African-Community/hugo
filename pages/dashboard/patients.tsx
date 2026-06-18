import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";

type PatientStatus = "ACTIVE" | "INACTIVE" | "ARCHIVED";

interface EntityListItem {
  id: string;
  name: string;
  isActive: boolean;
}

interface Patient {
  id: string;
  entityId: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  cnsNumber?: string | null;
  status: PatientStatus;
  notes?: string | null;
  updatedAt: string;
}

interface PatientForm {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  cnsNumber: string;
  status: PatientStatus;
  notes: string;
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
const INPUT =
  "w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm font-medium text-black outline-none transition placeholder:text-black/30 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10";
const BUTTON_DARK =
  "inline-flex items-center justify-center rounded-full bg-black px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition-all duration-200 hover:-translate-y-px hover:bg-slate-800 hover:shadow-md active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50";
const BUTTON_LIGHT =
  "inline-flex items-center justify-center rounded-full border border-black/10 bg-white px-4 py-2.5 text-xs font-semibold text-black transition hover:border-black hover:bg-black hover:text-white disabled:cursor-not-allowed disabled:opacity-50";

const STATUS_OPTIONS: PatientStatus[] = ["ACTIVE", "INACTIVE", "ARCHIVED"];

const initialPatientForm = (): PatientForm => ({
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  cnsNumber: "",
  status: "ACTIVE",
  notes: "",
});

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

function patientDisplayName(patient: Patient) {
  return `${patient.firstName} ${patient.lastName}`.trim();
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "-"
    : new Intl.DateTimeFormat("fr-LU", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(date);
}

function formFromPatient(patient: Patient): PatientForm {
  return {
    firstName: patient.firstName,
    lastName: patient.lastName,
    email: patient.email || "",
    phone: patient.phone || "",
    cnsNumber: patient.cnsNumber || "",
    status: patient.status,
    notes: patient.notes || "",
  };
}

export default function PatientsDashboardPage() {
  const router = useRouter();
  const [entities, setEntities] = useState<EntityListItem[]>([]);
  const [activeEntityId, setActiveEntityId] = useState("");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [form, setForm] = useState<PatientForm>(initialPatientForm);
  const [editingPatientId, setEditingPatientId] = useState<string | null>(null);
  const [loadingEntities, setLoadingEntities] = useState(true);
  const [loadingPatients, setLoadingPatients] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingPatientId, setDeletingPatientId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const activeEntity = useMemo(
    () => entities.find((entity) => entity.id === activeEntityId) || null,
    [activeEntityId, entities]
  );

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
      throw new Error(payload.message || "Impossible de traiter la demande");
    }

    return payload.data as T;
  };

  const loadEntities = async () => {
    setLoadingEntities(true);
    setError(null);

    try {
      const data = await request<EntityListItem[]>("/api/entities");
      setEntities(data);

      const queryEntityId =
        typeof router.query.entityId === "string" ? router.query.entityId : "";
      const resolvedEntityId =
        data.find((entity) => entity.id === queryEntityId)?.id || data[0]?.id || "";

      setActiveEntityId(resolvedEntityId);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Impossible de charger les cabinets"
      );
    } finally {
      setLoadingEntities(false);
    }
  };

  const loadPatients = async (entityId: string) => {
    if (!entityId) {
      setPatients([]);
      return;
    }

    setLoadingPatients(true);
    setError(null);

    try {
      const data = await request<Patient[]>(
        `/api/hugo/patients?entityId=${encodeURIComponent(entityId)}`
      );
      setPatients(data);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Impossible de charger les patients"
      );
    } finally {
      setLoadingPatients(false);
    }
  };

  useEffect(() => {
    if (!router.isReady) return;
    loadEntities();
  }, [router.isReady]);

  useEffect(() => {
    if (!activeEntityId) return;
    loadPatients(activeEntityId);
  }, [activeEntityId]);

  const resetForm = () => {
    setForm(initialPatientForm());
    setEditingPatientId(null);
  };

  const handleEntityChange = (entityId: string) => {
    setActiveEntityId(entityId);
    resetForm();
    router.replace(
      `/dashboard/patients${entityId ? `?entityId=${entityId}` : ""}`,
      undefined,
      { shallow: true }
    );
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!activeEntityId) {
      setError("Aucun cabinet selectionne.");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    const payload = {
      entityId: activeEntityId,
      firstName: form.firstName,
      lastName: form.lastName,
      email: form.email,
      phone: form.phone,
      cnsNumber: form.cnsNumber,
      status: form.status,
      notes: form.notes,
    };

    try {
      if (editingPatientId) {
        const updated = await request<Patient>(
          `/api/hugo/patients/${editingPatientId}`,
          {
            method: "PATCH",
            body: JSON.stringify(payload),
          }
        );
        setPatients((current) =>
          current.map((patient) =>
            patient.id === updated.id ? updated : patient
          )
        );
        setSuccess("Patient mis a jour.");
      } else {
        const created = await request<Patient>("/api/hugo/patients", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setPatients((current) => [created, ...current]);
        setSuccess("Patient cree.");
      }

      resetForm();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Impossible d'enregistrer le patient"
      );
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (patient: Patient) => {
    setEditingPatientId(patient.id);
    setForm(formFromPatient(patient));
    setError(null);
    setSuccess(null);
  };

  const handleDelete = async (patient: Patient) => {
    if (!activeEntityId) return;

    setDeletingPatientId(patient.id);
    setError(null);
    setSuccess(null);

    try {
      await request<{ id: string }>(
        `/api/hugo/patients/${patient.id}?entityId=${encodeURIComponent(
          activeEntityId
        )}`,
        { method: "DELETE" }
      );
      setPatients((current) =>
        current.filter((currentPatient) => currentPatient.id !== patient.id)
      );
      if (editingPatientId === patient.id) {
        resetForm();
      }
      setSuccess("Patient supprime.");
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Impossible de supprimer le patient"
      );
    } finally {
      setDeletingPatientId(null);
    }
  };

  return (
    <div className={cn(PAGE_BG, "min-h-screen text-black")}>
      <header className="border-b border-black/5 bg-[#ececf1]/90 backdrop-blur-md">
        <nav className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-5">
          <LogoMark />
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => router.push("/dashboard")}
              className={BUTTON_LIGHT}
            >
              Cockpit
            </button>
            <button
              type="button"
              onClick={() => router.push("/dashboard/users")}
              className={BUTTON_LIGHT}
            >
              Acces
            </button>
            <button
              type="button"
              onClick={() => router.push("/dashboard/prescriptions")}
              className={BUTTON_LIGHT}
            >
              Prescriptions
            </button>
            <button
              type="button"
              onClick={() => router.push("/dashboard/sessions")}
              className={BUTTON_LIGHT}
            >
              Séances
            </button>
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-6 pb-16 pt-8">
        <section className={cn(CARD, "p-6")}>
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-500">
                Patients
              </p>
              <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em]">
                Liste patients
              </h1>
              <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-black/50">
                Un premier espace simple pour creer, modifier et garder les
                coordonnees essentielles des patients du cabinet.
              </p>
            </div>

            <label className="block min-w-[240px]">
              <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.14em] text-black/45">
                Cabinet
              </span>
              <select
                value={activeEntityId}
                onChange={(event) => handleEntityChange(event.target.value)}
                disabled={loadingEntities || !entities.length}
                className={INPUT}
              >
                {!entities.length && <option value="">Aucun cabinet</option>}
                {entities.map((entity) => (
                  <option key={entity.id} value={entity.id}>
                    {entity.name}
                  </option>
                ))}
              </select>
            </label>
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

        <section className="mt-4 grid gap-4 xl:grid-cols-[0.95fr_1.25fr]">
          <div className={cn(CARD, "p-5")}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-500">
              {editingPatientId ? "Edition" : "Nouveau patient"}
            </p>
            <h2 className="mt-3 text-xl font-semibold tracking-[-0.03em]">
              {editingPatientId ? "Modifier le patient" : "Ajouter un patient"}
            </h2>

            <form onSubmit={handleSubmit} className="mt-5 grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                    Prenom
                  </span>
                  <input
                    value={form.firstName}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        firstName: event.target.value,
                      }))
                    }
                    className={INPUT}
                    required
                  />
                </label>

                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                    Nom
                  </span>
                  <input
                    value={form.lastName}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        lastName: event.target.value,
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
                    Email
                  </span>
                  <input
                    value={form.email}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        email: event.target.value,
                      }))
                    }
                    className={INPUT}
                    type="email"
                  />
                </label>

                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                    Telephone
                  </span>
                  <input
                    value={form.phone}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        phone: event.target.value,
                      }))
                    }
                    className={INPUT}
                  />
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                    CNS
                  </span>
                  <input
                    value={form.cnsNumber}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        cnsNumber: event.target.value,
                      }))
                    }
                    className={INPUT}
                  />
                </label>

                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                    Statut
                  </span>
                  <select
                    value={form.status}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        status: event.target.value as PatientStatus,
                      }))
                    }
                    className={INPUT}
                  >
                    {STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>
                        {status}
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
                <button
                  type="submit"
                  disabled={saving || !activeEntityId}
                  className={BUTTON_DARK}
                >
                  {saving
                    ? "Enregistrement..."
                    : editingPatientId
                    ? "Mettre a jour"
                    : "Creer le patient"}
                </button>
                {editingPatientId && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className={BUTTON_LIGHT}
                  >
                    Annuler
                  </button>
                )}
              </div>
            </form>
          </div>

          <div className={cn(CARD, "overflow-hidden")}>
            <div className="flex flex-col gap-2 border-b border-black/5 px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold tracking-[-0.03em]">
                  Patients
                </h2>
                <p className="mt-1 text-sm font-medium text-black/45">
                  {activeEntity?.name || "Cabinet"} - {patients.length} patient
                  {patients.length > 1 ? "s" : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => activeEntityId && loadPatients(activeEntityId)}
                disabled={loadingPatients || !activeEntityId}
                className={BUTTON_LIGHT}
              >
                {loadingPatients ? "Chargement..." : "Actualiser"}
              </button>
            </div>

            {loadingPatients ? (
              <div className="px-5 py-10">
                <div className="animate-pulse space-y-3">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div key={index} className="h-16 rounded-2xl bg-black/5" />
                  ))}
                </div>
              </div>
            ) : !patients.length ? (
              <div className="px-5 py-14 text-center">
                <p className="text-base font-semibold">Aucun patient.</p>
                <p className="mt-2 text-sm font-medium text-black/50">
                  Ajoutez le premier patient pour commencer a structurer le
                  suivi du cabinet.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-black/5">
                {patients.map((patient) => (
                  <div
                    key={patient.id}
                    className="grid gap-4 px-5 py-5 transition hover:bg-black/[0.02] lg:grid-cols-[1fr_auto]"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">
                          {patientDisplayName(patient)}
                        </p>
                        <span className="rounded-full bg-[#f4f4f7] px-2.5 py-1 text-[10px] font-semibold text-black/55">
                          {patient.status}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium text-black/45">
                        <span>{patient.email || "Email manquant"}</span>
                        <span>{patient.phone || "Telephone manquant"}</span>
                        <span>{patient.cnsNumber || "CNS manquant"}</span>
                        <span>MAJ {formatDate(patient.updatedAt)}</span>
                      </div>
                      {patient.notes && (
                        <p className="mt-3 line-clamp-2 text-sm font-medium leading-6 text-black/50">
                          {patient.notes}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                      <button
                        type="button"
                        onClick={() => handleEdit(patient)}
                        className={BUTTON_LIGHT}
                      >
                        Modifier
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(patient)}
                        disabled={deletingPatientId === patient.id}
                        className="inline-flex items-center justify-center rounded-full border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-semibold text-red-700 transition hover:border-red-300 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {deletingPatientId === patient.id
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
