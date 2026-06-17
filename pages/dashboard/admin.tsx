import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";

interface OrganizationRecord {
  id: string;
  name: string;
  legalName?: string | null;
  type: string;
  country: string;
  baseCurrency: string;
  maxUsers: number;
  status: "ACTIVE" | "INACTIVE" | "SUSPENDED";
  isActive: boolean;
  createdAt: string;
  usersCount: number;
  entitiesCount: number;
  adminEmails: string[];
}

interface AdminOrganizationUser {
  id: string;
  email: string;
  userRole: string;
  platformRole: string;
  organizationUserId: string;
  organizationRole: string;
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: string;
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
}

interface OrganizationForm {
  name: string;
  legalName: string;
  type: string;
  country: string;
  baseCurrency: string;
  maxUsers: string;
  adminEmail: string;
  temporaryPassword: string;
}

type ClassValue = string | false | null | undefined;

const cn = (...classes: ClassValue[]) => classes.filter(Boolean).join(" ");
const PAGE_BG = "bg-[#ececf1]";
const CARD =
  "rounded-[1.5rem] border border-black/10 bg-white shadow-[0_12px_35px_rgba(15,23,42,0.05)]";
const INPUT =
  "w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm font-medium text-black outline-none transition placeholder:text-black/30 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10";
const BUTTON_BLUE =
  "inline-flex items-center justify-center rounded-full bg-blue-500 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition-all duration-200 hover:-translate-y-px hover:bg-blue-600 hover:shadow-md active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50";
const BUTTON_DARK =
  "inline-flex items-center justify-center rounded-full bg-black px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition-all duration-200 hover:-translate-y-px hover:bg-slate-800 hover:shadow-md active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50";

const ORGANIZATION_TYPES = [
  "COMPANY",
  "OTHER",
];

const initialForm = (): OrganizationForm => ({
  name: "",
  legalName: "",
  type: "COMPANY",
  country: "LU",
  baseCurrency: "EUR",
  maxUsers: "5",
  adminEmail: "",
  temporaryPassword: "",
});

function LogoMark() {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-6 w-7 items-center gap-[3px]">
        <span className="h-6 w-3 rounded-[2px] bg-black" />
        <span className="h-6 w-3 rounded-[2px] bg-black" />
      </div>
      <span className="text-sm font-bold tracking-tight text-black">
        Hugo
      </span>
    </div>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(date);
}

function KpiCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
}) {
  return (
    <div className={cn(CARD, "p-4")}>
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-black/45">
          {label}
        </p>
        <span
          className={cn(
            "h-2.5 w-2.5 rounded-full",
            accent ? "bg-blue-500" : "bg-black/10"
          )}
        />
      </div>
      <p className="mt-4 text-3xl font-bold tracking-[-0.04em]">{value}</p>
    </div>
  );
}

function organizationStatusClass(status: OrganizationRecord["status"]) {
  if (status === "ACTIVE") return "bg-emerald-50 text-emerald-700";
  if (status === "SUSPENDED") return "bg-red-50 text-red-700";
  return "bg-slate-100 text-slate-500";
}

export default function AdminConsolePage() {
  const router = useRouter();
  const [organizations, setOrganizations] = useState<OrganizationRecord[]>([]);
  const [form, setForm] = useState<OrganizationForm>(initialForm);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [updatingOrganizationId, setUpdatingOrganizationId] = useState<string | null>(
    null
  );
  const [selectedOrganizationId, setSelectedOrganizationId] = useState("");
  const [organizationUsers, setOrganizationUsers] = useState<AdminOrganizationUser[]>(
    []
  );
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [resetUserId, setResetUserId] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [resettingPassword, setResettingPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [createdCredentials, setCreatedCredentials] = useState<{
    email: string;
    temporaryPassword: string;
  } | null>(null);

  const request = async <T,>(url: string, options: RequestInit = {}) => {
    const token = localStorage.getItem("token");

    if (!token) {
      router.replace("/login");
      throw new Error("Your session has expired. Please sign in again.");
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
      throw new Error(payload.message || "Unable to complete request");
    }

    return payload.data as T;
  };

  const loadOrganizations = async (showRefresh = false) => {
    if (showRefresh) {
      setRefreshing(true);
    }

    try {
      setError(null);
      const data = await request<OrganizationRecord[]>("/api/admin/organizations");
      setOrganizations(data);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load organizations"
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadOrganizations();
  }, []);

  const kpis = useMemo(() => {
    return {
      totalOrganizations: organizations.length,
      activeOrganizations: organizations.filter(
        (organization) => organization.status === "ACTIVE"
      ).length,
      totalUsers: organizations.reduce(
        (sum, organization) => sum + organization.usersCount,
        0
      ),
      totalEntities: organizations.reduce(
        (sum, organization) => sum + organization.entitiesCount,
        0
      ),
    };
  }, [organizations]);

  const selectedOrganization = useMemo(
    () =>
      organizations.find((organization) => organization.id === selectedOrganizationId) ||
      null,
    [organizations, selectedOrganizationId]
  );

  const handleLogout = () => {
    localStorage.removeItem("token");
    router.push("/login");
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    setCreatedCredentials(null);

    try {
      const temporaryPassword = form.temporaryPassword;
      const data = await request<{
        organization: OrganizationRecord;
        adminUser: {
          id: string;
          email: string;
          mustChangePassword: boolean;
        };
      }>("/api/admin/organizations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: form.name,
          legalName: form.legalName || undefined,
          type: form.type,
          country: form.country,
          baseCurrency: form.baseCurrency,
          maxUsers: Number(form.maxUsers),
          adminEmail: form.adminEmail,
          temporaryPassword,
        }),
      });

      setSuccess(
        `Organization created. ${data.adminUser.email} must change password on first login.`
      );
      setCreatedCredentials({
        email: data.adminUser.email,
        temporaryPassword,
      });
      setForm(initialForm());
      await loadOrganizations();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to create organization"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleOrganizationStatus = async (
    organization: OrganizationRecord,
    status: OrganizationRecord["status"]
  ) => {
    setUpdatingOrganizationId(organization.id);
    setError(null);
    setSuccess(null);

    try {
      await request<OrganizationRecord>(
        `/api/admin/organizations/${organization.id}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        }
      );

      setSuccess(`${organization.name} status updated to ${status}.`);
      await loadOrganizations();
    } catch (statusError) {
      setError(
        statusError instanceof Error
          ? statusError.message
          : "Unable to update organization status"
      );
    } finally {
      setUpdatingOrganizationId(null);
    }
  };

  const loadOrganizationUsers = async (organizationId: string) => {
    setSelectedOrganizationId(organizationId);
    setResetUserId("");
    setResetPassword("");
    setLoadingUsers(true);
    setError(null);

    try {
      const users = await request<AdminOrganizationUser[]>(
        `/api/admin/organizations/${organizationId}/users`
      );
      setOrganizationUsers(users);
    } catch (usersError) {
      setError(
        usersError instanceof Error
          ? usersError.message
          : "Unable to load organization users"
      );
      setOrganizationUsers([]);
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleResetPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedOrganizationId) return;

    setResettingPassword(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await request<{ message?: string }>(
        `/api/admin/organizations/${selectedOrganizationId}/reset-admin-password`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: resetUserId,
            temporaryPassword: resetPassword,
          }),
        }
      );

      setSuccess(
        response?.message ||
          "Password reset. User must change password on next login."
      );
      setResetPassword("");
      await loadOrganizationUsers(selectedOrganizationId);
    } catch (resetError) {
      setError(
        resetError instanceof Error
          ? resetError.message
          : "Unable to reset password"
      );
    } finally {
      setResettingPassword(false);
    }
  };

  return (
    <main className={cn(PAGE_BG, "min-h-screen px-6 py-6 text-black")}>
      <div className="mx-auto max-w-7xl">
        <header className={cn(CARD, "p-6")}>
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <LogoMark />
              <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-500">
                Platform administration
              </p>
              <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em]">
                Admin Console
              </h1>
              <p className="mt-3 text-sm font-medium text-black/50">
                Create and manage client organizations.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => loadOrganizations(true)}
                disabled={refreshing}
                className={BUTTON_DARK}
              >
                {refreshing ? "Refreshing..." : "Refresh"}
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-full border border-black px-4 py-2.5 text-xs font-semibold text-black transition hover:bg-black hover:text-white"
              >
                Logout
              </button>
            </div>
          </div>
        </header>

        {(error || success || createdCredentials) && (
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
            {createdCredentials && (
              <div className="rounded-2xl border border-blue-200 bg-blue-50 px-5 py-4 text-sm font-medium text-blue-800">
                <p className="font-semibold">Temporary credentials</p>
                <p className="mt-2">
                  {createdCredentials.email} /{" "}
                  <span className="font-mono font-semibold">
                    {createdCredentials.temporaryPassword}
                  </span>
                </p>
                <p className="mt-2 text-blue-700">
                  User will be required to change this password on first login.
                </p>
              </div>
            )}
          </section>
        )}

        <section className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="Total organizations" value={kpis.totalOrganizations} accent />
          <KpiCard label="Active organizations" value={kpis.activeOrganizations} />
          <KpiCard label="Organization users" value={kpis.totalUsers || "—"} />
          <KpiCard label="Entities" value={kpis.totalEntities || "—"} />
        </section>

        <section className="mt-4 grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
          <div className={cn(CARD, "order-1 p-5")}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-500">
              Provisioning
            </p>
            <h2 className="mt-3 text-xl font-semibold tracking-[-0.03em]">
              Create organization
            </h2>
            <p className="mt-2 text-sm font-medium text-black/45">
              Create the client organization and provision the first organization
              admin.
            </p>

            <form onSubmit={handleSubmit} className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="md:col-span-2">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                  Organization name
                </span>
                <input
                  required
                  value={form.name}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, name: event.target.value }))
                  }
                  placeholder="Cabinet Hugo"
                  className={INPUT}
                />
              </label>

              <label className="md:col-span-2">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                  Legal name <span className="text-black/30">optional</span>
                </span>
                <input
                  value={form.legalName}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      legalName: event.target.value,
                    }))
                  }
                  placeholder="Cabinet Hugo"
                  className={INPUT}
                />
              </label>

              <label>
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                  Organization type
                </span>
                <select
                  value={form.type}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, type: event.target.value }))
                  }
                  className={INPUT}
                >
                  {ORGANIZATION_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                  Country
                </span>
                <input
                  value={form.country}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, country: event.target.value }))
                  }
                  placeholder="LU"
                  className={INPUT}
                />
              </label>

              <label>
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                  Base currency
                </span>
                <input
                  value={form.baseCurrency}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      baseCurrency: event.target.value.toUpperCase(),
                    }))
                  }
                  placeholder="EUR"
                  className={INPUT}
                />
              </label>

              <label>
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                  Max users
                </span>
                <input
                  type="number"
                  min="1"
                  value={form.maxUsers}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, maxUsers: event.target.value }))
                  }
                  className={INPUT}
                />
              </label>

              <label className="md:col-span-2">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                  Admin email
                </span>
                <input
                  type="email"
                  required
                  value={form.adminEmail}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      adminEmail: event.target.value,
                    }))
                  }
                  placeholder="admin@client.local"
                  className={INPUT}
                />
              </label>

              <label className="md:col-span-2">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                  Temporary password
                </span>
                <input
                  type="text"
                  required
                  minLength={8}
                  value={form.temporaryPassword}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      temporaryPassword: event.target.value,
                    }))
                  }
                  placeholder="Minimum 8 characters"
                  className={INPUT}
                />
                <p className="mt-2 text-xs font-medium text-black/45">
                  User will be required to change this password on first login.
                </p>
              </label>

              <div className="md:col-span-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className={BUTTON_BLUE}
                >
                  {submitting ? "Creating..." : "Create organization"}
                </button>
              </div>
            </form>
          </div>

          <div className={cn(CARD, "order-3 overflow-hidden xl:col-span-2")}>
            <div className="border-b border-black/5 px-5 py-4">
              <h2 className="text-xl font-semibold tracking-[-0.03em]">
                Organizations
              </h2>
              <p className="mt-1 text-sm font-medium text-black/45">
                Client organizations provisioned on the platform.
              </p>
            </div>

            {loading ? (
              <div className="px-5 py-10 text-sm font-medium text-black/45">
                Loading organizations...
              </div>
            ) : !organizations.length ? (
              <div className="px-5 py-10 text-sm font-medium text-black/45">
                No organizations created yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-[#f7f7f9] text-[11px] font-semibold uppercase tracking-[0.14em] text-black/40">
                    <tr>
                      <th className="px-5 py-3">Organization</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Country</th>
                      <th className="px-4 py-3">Currency</th>
                      <th className="px-4 py-3 text-right">Users</th>
                      <th className="px-4 py-3 text-right">Entities</th>
                      <th className="px-4 py-3 text-right">Max users</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Created</th>
                      <th className="px-5 py-3">Admin email(s)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5">
                    {organizations.map((organization) => (
                      <tr className="transition hover:bg-black/[0.02]" key={organization.id}>
                        <td className="px-5 py-4">
                          <p className="font-semibold">{organization.name}</p>
                          <p className="mt-1 text-xs font-medium text-black/45">
                            {organization.legalName || "—"}
                          </p>
                        </td>
                        <td className="px-4 py-4 font-medium text-black/60">
                          {organization.type}
                        </td>
                        <td className="px-4 py-4 font-medium text-black/60">
                          {organization.country}
                        </td>
                        <td className="px-4 py-4 font-medium text-black/60">
                          {organization.baseCurrency}
                        </td>
                        <td className="px-4 py-4 text-right font-mono text-xs font-bold">
                          {organization.usersCount}
                        </td>
                        <td className="px-4 py-4 text-right font-mono text-xs font-bold">
                          {organization.entitiesCount}
                        </td>
                        <td className="px-4 py-4 text-right font-mono text-xs font-bold">
                          {organization.maxUsers}
                        </td>
                        <td className="px-4 py-4">
                          <span
                            className={cn(
                              "rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]",
                              organizationStatusClass(organization.status)
                            )}
                          >
                            {organization.status}
                          </span>
                        </td>
                        <td className="px-4 py-4 font-medium text-black/60">
                          {formatDate(organization.createdAt)}
                        </td>
                        <td className="px-5 py-4 font-medium text-black/60">
                          {organization.adminEmails.length
                            ? organization.adminEmails.join(", ")
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className={cn(CARD, "order-2 overflow-hidden")}>
            <div className="border-b border-black/5 px-5 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-500">
                Organization access
              </p>
              <h2 className="mt-3 text-xl font-semibold tracking-[-0.03em]">
                {selectedOrganization
                  ? `Manage users for ${selectedOrganization.name}`
                  : "Manage users"}
              </h2>
              <p className="mt-1 text-sm font-medium text-black/45">
                Reset passwords without exposing password hashes. Users are
                forced to change temporary passwords at next login.
              </p>
              <label className="mt-4 block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                  Organization
                </span>
                <select
                  value={selectedOrganizationId}
                  onChange={(event) => {
                    const organizationId = event.target.value;

                    if (!organizationId) {
                      setSelectedOrganizationId("");
                      setOrganizationUsers([]);
                      setResetUserId("");
                      setResetPassword("");
                      return;
                    }

                    loadOrganizationUsers(organizationId);
                  }}
                  className={INPUT}
                >
                  <option value="">Search or select an organization...</option>
                  {organizations.map((organization) => (
                    <option key={organization.id} value={organization.id}>
                      {organization.name} · {organization.status}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {!selectedOrganization ? (
              <div className="px-5 py-12 text-sm font-medium text-black/45">
                Select an organization above to manage access, users and
                security controls.
              </div>
            ) : (
              <div className="space-y-4 p-5">
                <div className="rounded-[1.25rem] border border-black/5 bg-[#f7f7f9] p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <h3 className="text-lg font-semibold tracking-[-0.03em]">
                        {selectedOrganization.name}
                      </h3>
                      <p className="mt-1 text-sm font-medium text-black/45">
                        {selectedOrganization.legalName || "No legal name set"}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "w-fit rounded-full px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em]",
                        organizationStatusClass(selectedOrganization.status)
                      )}
                    >
                      {selectedOrganization.status}
                    </span>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-black/40">
                        Type
                      </p>
                      <p className="mt-1 text-sm font-medium text-black/70">
                        {selectedOrganization.type}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-black/40">
                        Country / currency
                      </p>
                      <p className="mt-1 text-sm font-medium text-black/70">
                        {selectedOrganization.country} ·{" "}
                        {selectedOrganization.baseCurrency}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-black/40">
                        Users
                      </p>
                      <p className="mt-1 text-sm font-medium text-black/70">
                        {selectedOrganization.usersCount} /{" "}
                        {selectedOrganization.maxUsers}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-black/40">
                        Entities / created
                      </p>
                      <p className="mt-1 text-sm font-medium text-black/70">
                        {selectedOrganization.entitiesCount} ·{" "}
                        {formatDate(selectedOrganization.createdAt)}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-[1.25rem] border border-black/5 bg-white p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-black/40">
                        Organization status
                      </p>
                      <p className="mt-1 text-sm font-medium text-black/55">
                        Status changes immediately affect organization access.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selectedOrganization.status !== "ACTIVE" && (
                        <button
                          type="button"
                          disabled={updatingOrganizationId === selectedOrganization.id}
                          onClick={() =>
                            handleOrganizationStatus(selectedOrganization, "ACTIVE")
                          }
                          className="rounded-full bg-emerald-600 px-3 py-2 text-[10px] font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                        >
                          Activate
                        </button>
                      )}
                      {selectedOrganization.status !== "INACTIVE" && (
                        <button
                          type="button"
                          disabled={updatingOrganizationId === selectedOrganization.id}
                          onClick={() =>
                            handleOrganizationStatus(selectedOrganization, "INACTIVE")
                          }
                          className="rounded-full border border-black/10 px-3 py-2 text-[10px] font-semibold text-black/60 transition hover:border-black hover:text-black disabled:opacity-50"
                        >
                          Deactivate
                        </button>
                      )}
                      {selectedOrganization.status !== "SUSPENDED" && (
                        <button
                          type="button"
                          disabled={updatingOrganizationId === selectedOrganization.id}
                          onClick={() =>
                            handleOrganizationStatus(selectedOrganization, "SUSPENDED")
                          }
                          className="rounded-full bg-red-600 px-3 py-2 text-[10px] font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
                        >
                          Suspend
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="rounded-[1.25rem] border border-black/5 bg-white p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-black/40">
                    Max users
                  </p>
                  <p className="mt-1 text-sm font-medium text-black/60">
                    Max users: {selectedOrganization.maxUsers}
                  </p>
                  <p className="mt-1 text-xs font-medium text-black/40">
                    User limit editing will be handled from this panel when the
                    update endpoint is added.
                  </p>
                </div>

              <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
                <form
                  onSubmit={handleResetPassword}
                  className="rounded-[1.25rem] border border-black/5 bg-[#f7f7f9] p-5"
                >
                  <h3 className="text-lg font-semibold tracking-[-0.03em]">
                    Reset user password
                  </h3>
                  <label className="mt-4 block">
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                      User
                    </span>
                    <select
                      required
                      value={resetUserId}
                      onChange={(event) => setResetUserId(event.target.value)}
                      className={INPUT}
                    >
                      <option value="">Select organization user</option>
                      {organizationUsers.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.email} · {user.organizationRole}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="mt-4 block">
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                      Temporary password
                    </span>
                    <input
                      required
                      minLength={8}
                      type="text"
                      value={resetPassword}
                      onChange={(event) => setResetPassword(event.target.value)}
                      placeholder="Minimum 8 characters"
                      className={INPUT}
                    />
                    <p className="mt-2 text-xs font-medium text-black/45">
                      The temporary password is not stored in audit metadata.
                    </p>
                  </label>
                  <button
                    type="submit"
                    disabled={resettingPassword || !resetUserId || !resetPassword}
                    className={cn(BUTTON_BLUE, "mt-5")}
                  >
                    {resettingPassword ? "Resetting..." : "Reset password"}
                  </button>
                </form>

                <div className="overflow-hidden rounded-[1.25rem] border border-black/5 bg-white">
                  {loadingUsers ? (
                    <p className="px-5 py-10 text-sm font-medium text-black/45">
                      Loading users...
                    </p>
                  ) : !organizationUsers.length ? (
                    <p className="px-5 py-10 text-sm font-medium text-black/45">
                      No users found for this organization.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-left text-sm">
                        <thead className="bg-[#f7f7f9] text-[11px] font-semibold uppercase tracking-[0.14em] text-black/40">
                          <tr>
                            <th className="px-5 py-3">Email</th>
                            <th className="px-4 py-3">Org role</th>
                            <th className="px-4 py-3">Active</th>
                            <th className="px-4 py-3">Must change</th>
                            <th className="px-5 py-3">Created</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-black/5">
                          {organizationUsers.map((user) => (
                            <tr className="transition hover:bg-black/[0.02]" key={user.id}>
                              <td className="px-5 py-4 font-medium text-black/75">
                                {user.email}
                              </td>
                              <td className="px-4 py-4 font-medium text-black/60">
                                {user.organizationRole}
                              </td>
                              <td className="px-4 py-4 font-medium text-black/60">
                                {user.isActive ? "Yes" : "No"}
                              </td>
                              <td className="px-4 py-4 font-medium text-black/60">
                                {user.mustChangePassword ? "Yes" : "No"}
                              </td>
                              <td className="px-5 py-4 font-medium text-black/60">
                                {formatDate(user.createdAt)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
              </div>
            )}
          </div>
        </section>

      </div>
    </main>
  );
}
