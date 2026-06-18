import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";

type PrescriptionStatus = "ACTIVE" | "COMPLETED" | "EXPIRED" | "CANCELLED";
type TherapySessionStatus = "PLANNED" | "COMPLETED" | "CANCELLED" | "MISSED";

interface Cabinet {
  cabinetId: string;
  name: string;
  organizationId: string;
}

interface Patient {
  id: string;
  firstName: string;
  lastName: string;
}

interface Prescription {
  id: string;
  patientId: string;
  title: string;
  prescribedSessions: number;
  completedSessions: number;
  status: PrescriptionStatus;
}

interface TherapySession {
  id: string;
  entityId: string;
  patientId: string;
  prescriptionId: string;
  patient: Patient;
  prescription: Prescription | null;
  sessionNumber: number;
  scheduledAt?: string | null;
  completedAt?: string | null;
  status: TherapySessionStatus;
  notes?: string | null;
  updatedAt: string;
}

interface SessionForm {
  patientId: string;
  prescriptionId: string;
  sessionNumber: string;
  scheduledAt: string;
  completedAt: string;
  status: TherapySessionStatus;
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

const STATUS_OPTIONS: TherapySessionStatus[] = [
  "PLANNED",
  "COMPLETED",
  "CANCELLED",
  "MISSED",
];

const initialSessionForm = (): SessionForm => ({
  patientId: "",
  prescriptionId: "",
  sessionNumber: "1",
  scheduledAt: "",
  completedAt: "",
  status: "PLANNED",
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

function patientDisplayName(patient?: Patient | null) {
  if (!patient) return "Patient inconnu";
  return `${patient.firstName} ${patient.lastName}`.trim();
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";

  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "-"
    : new Intl.DateTimeFormat("fr-LU", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
}

function dateTimeInputValue(value?: string | null) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function remainingSessions(prescription?: Prescription | null) {
  if (!prescription) return 0;
  return Math.max(
    0,
    prescription.prescribedSessions - prescription.completedSessions
  );
}

function isPrescriptionComplete(prescription?: Prescription | null) {
  return Boolean(prescription) && (
    remainingSessions(prescription) === 0 || prescription?.status === "COMPLETED"
  );
}

function prescriptionLabel(prescription: Prescription) {
  const remaining = remainingSessions(prescription);
  return `${prescription.title} - ${remaining} restante${
    remaining > 1 ? "s" : ""
  }${isPrescriptionComplete(prescription) ? " - complete" : ""}`;
}

function formFromSession(session: TherapySession): SessionForm {
  return {
    patientId: session.patientId,
    prescriptionId: session.prescriptionId,
    sessionNumber: String(session.sessionNumber),
    scheduledAt: dateTimeInputValue(session.scheduledAt),
    completedAt: dateTimeInputValue(session.completedAt),
    status: session.status,
    notes: session.notes || "",
  };
}

export default function SessionsDashboardPage() {
  const router = useRouter();
  const [cabinet, setCabinet] = useState<Cabinet | null>(null);
  const [activeEntityId, setActiveEntityId] = useState("");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [sessions, setSessions] = useState<TherapySession[]>([]);
  const [form, setForm] = useState<SessionForm>(initialSessionForm);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [loadingEntities, setLoadingEntities] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const activeEntity = useMemo(
    () => (cabinet?.cabinetId === activeEntityId ? cabinet : null),
    [activeEntityId, cabinet]
  );

  const filteredPrescriptions = useMemo(
    () =>
      prescriptions.filter(
        (prescription) => prescription.patientId === form.patientId
      ),
    [form.patientId, prescriptions]
  );

  const selectedPrescription = useMemo(
    () =>
      prescriptions.find(
        (prescription) => prescription.id === form.prescriptionId
      ) || null,
    [form.prescriptionId, prescriptions]
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

  const resolveInitialForm = (
    patientData: Patient[],
    prescriptionData: Prescription[]
  ) => {
    const patientId = patientData[0]?.id || "";
    const prescriptionId =
      prescriptionData.find((prescription) => prescription.patientId === patientId)
        ?.id || "";

    return {
      ...initialSessionForm(),
      patientId,
      prescriptionId,
    };
  };

  const loadEntities = async () => {
    setLoadingEntities(true);
    setError(null);

    try {
      const data = await request<Cabinet>("/api/hugo/cabinet");
      setCabinet(data);

      const queryEntityId =
        typeof router.query.entityId === "string" ? router.query.entityId : "";
      const resolvedEntityId =
        queryEntityId === data.cabinetId ? queryEntityId : data.cabinetId;

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

  const loadWorkspaceData = async (entityId: string) => {
    if (!entityId) {
      setPatients([]);
      setPrescriptions([]);
      setSessions([]);
      return;
    }

    setLoadingData(true);
    setError(null);

    try {
      const [patientData, prescriptionData, sessionData] = await Promise.all([
        request<Patient[]>(
          `/api/hugo/patients?entityId=${encodeURIComponent(entityId)}`
        ),
        request<Prescription[]>(
          `/api/hugo/prescriptions?entityId=${encodeURIComponent(entityId)}`
        ),
        request<TherapySession[]>(
          `/api/hugo/sessions?entityId=${encodeURIComponent(entityId)}`
        ),
      ]);

      setPatients(patientData);
      setPrescriptions(prescriptionData);
      setSessions(sessionData);
      setForm((current) => {
        if (current.patientId && current.prescriptionId) return current;
        return resolveInitialForm(patientData, prescriptionData);
      });
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Impossible de charger les seances"
      );
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    if (!router.isReady) return;
    loadEntities();
  }, [router.isReady]);

  useEffect(() => {
    if (!activeEntityId) return;
    loadWorkspaceData(activeEntityId);
  }, [activeEntityId]);

  useEffect(() => {
    if (!form.patientId) return;
    if (
      form.prescriptionId &&
      filteredPrescriptions.some(
        (prescription) => prescription.id === form.prescriptionId
      )
    ) {
      return;
    }

    setForm((current) => ({
      ...current,
      prescriptionId: filteredPrescriptions[0]?.id || "",
    }));
  }, [filteredPrescriptions, form.patientId, form.prescriptionId]);

  const resetForm = (
    nextPatientId = patients[0]?.id || "",
    nextPrescriptionId?: string
  ) => {
    const firstPrescription =
      nextPrescriptionId ||
      prescriptions.find((prescription) => prescription.patientId === nextPatientId)
        ?.id ||
      "";

    setForm({
      ...initialSessionForm(),
      patientId: nextPatientId,
      prescriptionId: firstPrescription,
    });
    setEditingSessionId(null);
  };

  const handleEntityChange = (entityId: string) => {
    setActiveEntityId(entityId);
    resetForm("");
    router.replace(
      `/dashboard/sessions${entityId ? `?entityId=${entityId}` : ""}`,
      undefined,
      { shallow: true }
    );
  };

  const handlePatientChange = (patientId: string) => {
    const firstPrescription =
      prescriptions.find((prescription) => prescription.patientId === patientId)
        ?.id || "";

    setForm((current) => ({
      ...current,
      patientId,
      prescriptionId: firstPrescription,
    }));
  };

  const buildPayload = () => ({
    entityId: activeEntityId,
    patientId: form.patientId,
    prescriptionId: form.prescriptionId,
    sessionNumber: Number(form.sessionNumber),
    scheduledAt: form.scheduledAt || null,
    completedAt: form.completedAt || null,
    status: form.status,
    notes: form.notes,
  });

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!activeEntityId) {
      setError("Aucun cabinet selectionne.");
      return;
    }

    if (!form.patientId || !form.prescriptionId) {
      setError("Selectionnez un patient et une prescription.");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    const payload = buildPayload();

    try {
      if (editingSessionId) {
        const updated = await request<TherapySession>(
          `/api/hugo/sessions/${editingSessionId}`,
          {
            method: "PATCH",
            body: JSON.stringify(payload),
          }
        );
        setSessions((current) =>
          current.map((session) => (session.id === updated.id ? updated : session))
        );
        setSuccess("Seance mise a jour.");
      } else {
        const created = await request<TherapySession>("/api/hugo/sessions", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setSessions((current) => [created, ...current]);
        setSuccess("Seance creee.");
      }

      await loadWorkspaceData(activeEntityId);
      resetForm(form.patientId, form.prescriptionId);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Impossible d'enregistrer la seance"
      );
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (session: TherapySession) => {
    setEditingSessionId(session.id);
    setForm(formFromSession(session));
    setError(null);
    setSuccess(null);
  };

  const handleDelete = async (session: TherapySession) => {
    if (!activeEntityId) return;

    setDeletingSessionId(session.id);
    setError(null);
    setSuccess(null);

    try {
      await request<{ id: string }>(
        `/api/hugo/sessions/${session.id}?entityId=${encodeURIComponent(
          activeEntityId
        )}`,
        { method: "DELETE" }
      );
      setSessions((current) =>
        current.filter((currentSession) => currentSession.id !== session.id)
      );
      if (editingSessionId === session.id) {
        resetForm();
      }
      setSuccess("Seance supprimee.");
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Impossible de supprimer la seance"
      );
    } finally {
      setDeletingSessionId(null);
    }
  };

  return (
    <div className={cn(PAGE_BG, "min-h-screen text-black")}>
      <header className="border-b border-black/5 bg-[#ececf1]/90 backdrop-blur-md">
        <nav className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-5">
          <LogoMark />
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => router.push("/dashboard")} className={BUTTON_LIGHT}>
              Cockpit
            </button>
            <button type="button" onClick={() => router.push("/dashboard/patients")} className={BUTTON_LIGHT}>
              Patients
            </button>
            <button type="button" onClick={() => router.push("/dashboard/prescriptions")} className={BUTTON_LIGHT}>
              Prescriptions
            </button>
            <button type="button" onClick={() => router.push("/dashboard/invoices")} className={BUTTON_LIGHT}>
              Factures
            </button>
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-6 pb-16 pt-8">
        <section className={cn(CARD, "p-6")}>
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-500">
                Séances
              </p>
              <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em]">
                Suivi des séances
              </h1>
              <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-black/50">
                Un espace simple pour planifier, completer et garder le fil des
                seances rattachees aux prescriptions.
              </p>
            </div>

            <label className="block min-w-[240px]">
              <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.14em] text-black/45">
                Cabinet
              </span>
              <select
                value={activeEntityId}
                onChange={(event) => handleEntityChange(event.target.value)}
                disabled={loadingEntities || !cabinet}
                className={INPUT}
              >
                {!cabinet && <option value="">Aucun cabinet</option>}
                {cabinet && (
                  <option value={cabinet.cabinetId}>{cabinet.name}</option>
                )}
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
              {editingSessionId ? "Edition" : "Nouvelle seance"}
            </p>
            <h2 className="mt-3 text-xl font-semibold tracking-[-0.03em]">
              {editingSessionId ? "Modifier la seance" : "Ajouter une seance"}
            </h2>

            <form onSubmit={handleSubmit} className="mt-5 grid gap-4">
              <label>
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                  Patient
                </span>
                <select
                  value={form.patientId}
                  onChange={(event) => handlePatientChange(event.target.value)}
                  className={INPUT}
                  required
                >
                  {!patients.length && <option value="">Aucun patient</option>}
                  {patients.map((patient) => (
                    <option key={patient.id} value={patient.id}>
                      {patientDisplayName(patient)}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                  Prescription
                </span>
                <select
                  value={form.prescriptionId}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      prescriptionId: event.target.value,
                    }))
                  }
                  className={INPUT}
                  required
                >
                  {!filteredPrescriptions.length && (
                    <option value="">Aucune prescription</option>
                  )}
                  {filteredPrescriptions.map((prescription) => (
                    <option key={prescription.id} value={prescription.id}>
                      {prescriptionLabel(prescription)}
                    </option>
                  ))}
                </select>
              </label>

              {selectedPrescription && (
                <div
                  className={cn(
                    "rounded-2xl border px-4 py-3 text-sm font-semibold",
                    isPrescriptionComplete(selectedPrescription)
                      ? "border-amber-200 bg-amber-50 text-amber-800"
                      : "border-blue-100 bg-blue-50 text-blue-700"
                  )}
                >
                  {isPrescriptionComplete(selectedPrescription)
                    ? "Prescription complete."
                    : `${remainingSessions(
                        selectedPrescription
                      )} seance(s) restante(s) sur cette prescription.`}
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                    Numero
                  </span>
                  <input
                    value={form.sessionNumber}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        sessionNumber: event.target.value,
                      }))
                    }
                    className={INPUT}
                    min={1}
                    required
                    type="number"
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
                        status: event.target.value as TherapySessionStatus,
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

              <div className="grid gap-4 sm:grid-cols-2">
                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                    Planifiee
                  </span>
                  <input
                    value={form.scheduledAt}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        scheduledAt: event.target.value,
                      }))
                    }
                    className={INPUT}
                    type="datetime-local"
                  />
                </label>

                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                    Realisee
                  </span>
                  <input
                    value={form.completedAt}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        completedAt: event.target.value,
                      }))
                    }
                    className={INPUT}
                    type="datetime-local"
                  />
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
                  disabled={
                    saving ||
                    !activeEntityId ||
                    !patients.length ||
                    !filteredPrescriptions.length
                  }
                  className={BUTTON_DARK}
                >
                  {saving
                    ? "Enregistrement..."
                    : editingSessionId
                    ? "Mettre a jour"
                    : "Creer la seance"}
                </button>
                {editingSessionId && (
                  <button
                    type="button"
                    onClick={() => resetForm()}
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
                  Séances
                </h2>
                <p className="mt-1 text-sm font-medium text-black/45">
                  {activeEntity?.name || "Cabinet"} - {sessions.length} seance
                  {sessions.length > 1 ? "s" : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => activeEntityId && loadWorkspaceData(activeEntityId)}
                disabled={loadingData || !activeEntityId}
                className={BUTTON_LIGHT}
              >
                {loadingData ? "Chargement..." : "Actualiser"}
              </button>
            </div>

            {loadingData ? (
              <div className="px-5 py-10">
                <div className="animate-pulse space-y-3">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div key={index} className="h-20 rounded-2xl bg-black/5" />
                  ))}
                </div>
              </div>
            ) : !sessions.length ? (
              <div className="px-5 py-14 text-center">
                <p className="text-base font-semibold">Aucune seance.</p>
                <p className="mt-2 text-sm font-medium text-black/50">
                  Ajoutez une premiere seance pour suivre l'avancement des
                  prescriptions.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-black/5">
                {sessions.map((session) => (
                  <div
                    key={session.id}
                    className="grid gap-4 px-5 py-5 transition hover:bg-black/[0.02] lg:grid-cols-[1fr_auto]"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">
                          Seance {session.sessionNumber}
                        </p>
                        <span className="rounded-full bg-[#f4f4f7] px-2.5 py-1 text-[10px] font-semibold text-black/55">
                          {session.status}
                        </span>
                      </div>

                      <p className="mt-2 text-sm font-semibold text-black/60">
                        {patientDisplayName(session.patient)} -{" "}
                        {session.prescription?.title || "Prescription inconnue"}
                      </p>

                      <div className="mt-3 grid gap-2 text-xs font-medium text-black/50 sm:grid-cols-2">
                        <span>Planifiee {formatDateTime(session.scheduledAt)}</span>
                        <span>Realisee {formatDateTime(session.completedAt)}</span>
                        {session.prescription && (
                          <>
                            <span>
                              {remainingSessions(session.prescription)} restante
                              {remainingSessions(session.prescription) > 1
                                ? "s"
                                : ""}
                            </span>
                            <span>
                              {isPrescriptionComplete(session.prescription)
                                ? "Prescription complete"
                                : "Prescription active"}
                            </span>
                          </>
                        )}
                      </div>

                      {session.notes && (
                        <p className="mt-3 line-clamp-2 text-sm font-medium leading-6 text-black/50">
                          {session.notes}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                      <button
                        type="button"
                        onClick={() => handleEdit(session)}
                        className={BUTTON_LIGHT}
                      >
                        Modifier
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(session)}
                        disabled={deletingSessionId === session.id}
                        className="inline-flex items-center justify-center rounded-full border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-semibold text-red-700 transition hover:border-red-300 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {deletingSessionId === session.id
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
