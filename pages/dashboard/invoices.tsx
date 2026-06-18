import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";

type InvoiceStatus = "DRAFT" | "READY" | "ISSUED" | "PAID" | "CANCELLED";

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
}

interface Invoice {
  id: string;
  patientId: string;
  prescriptionId: string | null;
  patient: Patient;
  prescription: Prescription | null;
  invoiceNumber?: string | null;
  status: InvoiceStatus;
  amountCents: number;
  currency: string;
  issuedAt?: string | null;
  dueAt?: string | null;
  paidAt?: string | null;
  updatedAt: string;
}

interface InvoiceForm {
  patientId: string;
  prescriptionId: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  amount: string;
  currency: string;
  issuedAt: string;
  dueAt: string;
  paidAt: string;
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

const STATUS_OPTIONS: InvoiceStatus[] = [
  "DRAFT",
  "READY",
  "ISSUED",
  "PAID",
  "CANCELLED",
];

const initialInvoiceForm = (): InvoiceForm => ({
  patientId: "",
  prescriptionId: "",
  invoiceNumber: "",
  status: "DRAFT",
  amount: "0.00",
  currency: "EUR",
  issuedAt: "",
  dueAt: "",
  paidAt: "",
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

function dateInputValue(value?: string | null) {
  if (!value) return "";

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function amountInputValue(amountCents: number) {
  return (amountCents / 100).toFixed(2);
}

function amountToCents(value: string) {
  const normalized = value.replace(",", ".").trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : NaN;
}

function formatAmount(amountCents: number, currency: string) {
  return new Intl.NumberFormat("fr-LU", {
    style: "currency",
    currency: currency || "EUR",
  }).format(amountCents / 100);
}

function formFromInvoice(invoice: Invoice): InvoiceForm {
  return {
    patientId: invoice.patientId,
    prescriptionId: invoice.prescriptionId || "",
    invoiceNumber: invoice.invoiceNumber || "",
    status: invoice.status,
    amount: amountInputValue(invoice.amountCents),
    currency: invoice.currency || "EUR",
    issuedAt: dateInputValue(invoice.issuedAt),
    dueAt: dateInputValue(invoice.dueAt),
    paidAt: dateInputValue(invoice.paidAt),
  };
}

export default function InvoicesDashboardPage() {
  const router = useRouter();
  const [cabinet, setCabinet] = useState<Cabinet | null>(null);
  const [activeEntityId, setActiveEntityId] = useState("");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [form, setForm] = useState<InvoiceForm>(initialInvoiceForm);
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);
  const [loadingEntities, setLoadingEntities] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingInvoiceId, setDeletingInvoiceId] = useState<string | null>(null);
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
      ...initialInvoiceForm(),
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
      setInvoices([]);
      return;
    }

    setLoadingData(true);
    setError(null);

    try {
      const [patientData, prescriptionData, invoiceData] = await Promise.all([
        request<Patient[]>(
          `/api/hugo/patients?entityId=${encodeURIComponent(entityId)}`
        ),
        request<Prescription[]>(
          `/api/hugo/prescriptions?entityId=${encodeURIComponent(entityId)}`
        ),
        request<Invoice[]>("/api/hugo/invoices"),
      ]);

      setPatients(patientData);
      setPrescriptions(prescriptionData);
      setInvoices(invoiceData);
      setForm((current) => {
        if (current.patientId && current.prescriptionId) return current;
        return resolveInitialForm(patientData, prescriptionData);
      });
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Impossible de charger les factures"
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
      ...initialInvoiceForm(),
      patientId: nextPatientId,
      prescriptionId: firstPrescription,
    });
    setEditingInvoiceId(null);
  };

  const handleEntityChange = (entityId: string) => {
    setActiveEntityId(entityId);
    resetForm("");
    router.replace(
      `/dashboard/invoices${entityId ? `?entityId=${entityId}` : ""}`,
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
    patientId: form.patientId,
    prescriptionId: form.prescriptionId,
    invoiceNumber: form.invoiceNumber,
    status: form.status,
    amountCents: amountToCents(form.amount),
    currency: form.currency || "EUR",
    issuedAt: form.issuedAt || null,
    dueAt: form.dueAt || null,
    paidAt: form.paidAt || null,
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

    const amountCents = amountToCents(form.amount);
    if (!Number.isInteger(amountCents) || amountCents < 0) {
      setError("Le montant doit etre positif ou egal a zero.");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    const payload = buildPayload();

    try {
      if (editingInvoiceId) {
        const updated = await request<Invoice>(
          `/api/hugo/invoices/${editingInvoiceId}`,
          {
            method: "PATCH",
            body: JSON.stringify(payload),
          }
        );
        setInvoices((current) =>
          current.map((invoice) => (invoice.id === updated.id ? updated : invoice))
        );
        setSuccess("Facture mise a jour.");
      } else {
        const created = await request<Invoice>("/api/hugo/invoices", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setInvoices((current) => [created, ...current]);
        setSuccess("Facture creee.");
      }

      resetForm(form.patientId, form.prescriptionId);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Impossible d'enregistrer la facture"
      );
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (invoice: Invoice) => {
    setEditingInvoiceId(invoice.id);
    setForm(formFromInvoice(invoice));
    setError(null);
    setSuccess(null);
  };

  const handleDelete = async (invoice: Invoice) => {
    setDeletingInvoiceId(invoice.id);
    setError(null);
    setSuccess(null);

    try {
      await request<{ id: string }>(`/api/hugo/invoices/${invoice.id}`, {
        method: "DELETE",
      });
      setInvoices((current) =>
        current.filter((currentInvoice) => currentInvoice.id !== invoice.id)
      );
      if (editingInvoiceId === invoice.id) {
        resetForm();
      }
      setSuccess("Facture supprimee.");
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Impossible de supprimer la facture"
      );
    } finally {
      setDeletingInvoiceId(null);
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
            <button type="button" onClick={() => router.push("/dashboard/sessions")} className={BUTTON_LIGHT}>
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
                Factures
              </p>
              <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em]">
                Suivi des factures
              </h1>
              <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-black/50">
                Un espace simple pour preparer, suivre et mettre a jour les
                factures du cabinet.
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
              {editingInvoiceId ? "Edition" : "Nouvelle facture"}
            </p>
            <h2 className="mt-3 text-xl font-semibold tracking-[-0.03em]">
              {editingInvoiceId ? "Modifier la facture" : "Ajouter une facture"}
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
                      {prescription.title}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                    Numero
                  </span>
                  <input
                    value={form.invoiceNumber}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        invoiceNumber: event.target.value,
                      }))
                    }
                    className={INPUT}
                    placeholder="Optionnel"
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
                        status: event.target.value as InvoiceStatus,
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

              <div className="grid gap-4 sm:grid-cols-[1fr_0.55fr]">
                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                    Montant
                  </span>
                  <input
                    value={form.amount}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        amount: event.target.value,
                      }))
                    }
                    className={INPUT}
                    min={0}
                    step="0.01"
                    type="number"
                    required
                  />
                </label>

                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                    Devise
                  </span>
                  <input
                    value={form.currency}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        currency: event.target.value.toUpperCase(),
                      }))
                    }
                    className={INPUT}
                    maxLength={3}
                    required
                  />
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                    Emise
                  </span>
                  <input
                    value={form.issuedAt}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        issuedAt: event.target.value,
                      }))
                    }
                    className={INPUT}
                    type="date"
                  />
                </label>

                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                    Due
                  </span>
                  <input
                    value={form.dueAt}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        dueAt: event.target.value,
                      }))
                    }
                    className={INPUT}
                    type="date"
                  />
                </label>

                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                    Payee
                  </span>
                  <input
                    value={form.paidAt}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        paidAt: event.target.value,
                      }))
                    }
                    className={INPUT}
                    type="date"
                  />
                </label>
              </div>

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
                    : editingInvoiceId
                    ? "Mettre a jour"
                    : "Creer la facture"}
                </button>
                {editingInvoiceId && (
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
                  Factures
                </h2>
                <p className="mt-1 text-sm font-medium text-black/45">
                  {activeEntity?.name || "Cabinet"} - {invoices.length} facture
                  {invoices.length > 1 ? "s" : ""}
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
            ) : !invoices.length ? (
              <div className="px-5 py-14 text-center">
                <p className="text-base font-semibold">Aucune facture.</p>
                <p className="mt-2 text-sm font-medium text-black/50">
                  Creez une premiere facture pour commencer le suivi.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-black/5">
                {invoices.map((invoice) => (
                  <div
                    key={invoice.id}
                    className="grid gap-4 px-5 py-5 transition hover:bg-black/[0.02] lg:grid-cols-[1fr_auto]"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">
                          {invoice.invoiceNumber || "Facture sans numero"}
                        </p>
                        <span className="rounded-full bg-[#f4f4f7] px-2.5 py-1 text-[10px] font-semibold text-black/55">
                          {invoice.status}
                        </span>
                      </div>

                      <p className="mt-2 text-sm font-medium text-black/55">
                        {patientDisplayName(invoice.patient)} -{" "}
                        {invoice.prescription?.title || "Prescription"}
                      </p>

                      <div className="mt-3 grid gap-2 text-xs font-medium text-black/45 sm:grid-cols-2">
                        <span>
                          Montant :{" "}
                          <strong className="text-black/70">
                            {formatAmount(invoice.amountCents, invoice.currency)}
                          </strong>
                        </span>
                        <span>Emise : {formatDate(invoice.issuedAt)}</span>
                        <span>Due : {formatDate(invoice.dueAt)}</span>
                        <span>Payee : {formatDate(invoice.paidAt)}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 lg:justify-end">
                      <button
                        type="button"
                        onClick={() => handleEdit(invoice)}
                        className={BUTTON_LIGHT}
                      >
                        Modifier
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(invoice)}
                        disabled={deletingInvoiceId === invoice.id}
                        className={BUTTON_LIGHT}
                      >
                        {deletingInvoiceId === invoice.id
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
