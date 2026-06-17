import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";

interface ManagedOrganizationOption {
  id: string;
  name: string;
  maxUsers: number;
}

interface InternalUserRecord {
  id: string;
  organizationUserId: string;
  email: string;
  role: string;
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  entityAccess: {
    entityId: string;
    entityName: string;
    role: string;
    isActive: boolean;
  }[];
}

interface ClientUserRecord {
  id: string;
  email: string;
  mustChangePassword: boolean;
  createdAt: string;
  entityAccess: {
    entityId: string;
    entityName: string;
    role: string;
    isActive: boolean;
  }[];
}

interface UsersPayload {
  organization: {
    id: string;
    name: string;
    maxUsers: number;
    activeUsersCount: number;
    clientUsersCount?: number;
  };
  users: InternalUserRecord[];
  clientUsers?: ClientUserRecord[];
}

interface OrganizationEntityRecord {
  id: string;
  name: string;
  type: string;
  baseCurrency: string;
  isActive: boolean;
}

interface OrganizationRecord {
  id: string;
  name: string;
  maxUsers: number;
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
}

interface InternalUserForm {
  email: string;
  temporaryPassword: string;
  role: string;
}

interface ClientUserForm {
  email: string;
  temporaryPassword: string;
  entityRole: string;
  entityIds: string[];
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

const INTERNAL_ROLES = [
  "ORG_ADMIN",
  "ORG_ACCOUNTANT",
  "ORG_REVIEWER",
  "ORG_VIEWER",
];
const CLIENT_ROLES = ["ENTITY_VIEWER"];

const initialInternalUserForm = (): InternalUserForm => ({
  email: "",
  temporaryPassword: "",
  role: "ORG_ACCOUNTANT",
});

const initialClientUserForm = (): ClientUserForm => ({
  email: "",
  temporaryPassword: "",
  entityRole: "ENTITY_VIEWER",
  entityIds: [],
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

export default function DashboardUsersPage() {
  const router = useRouter();
  const [organizations, setOrganizations] = useState<ManagedOrganizationOption[]>(
    []
  );
  const [selectedOrganizationId, setSelectedOrganizationId] = useState("");
  const [usersPayload, setUsersPayload] = useState<UsersPayload | null>(null);
  const [entities, setEntities] = useState<OrganizationEntityRecord[]>([]);
  const [internalForm, setInternalForm] = useState<InternalUserForm>(
    initialInternalUserForm
  );
  const [clientForm, setClientForm] = useState<ClientUserForm>(initialClientUserForm);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [submittingInternal, setSubmittingInternal] = useState(false);
  const [submittingClient, setSubmittingClient] = useState(false);
  const [updatingOrganizationUserId, setUpdatingOrganizationUserId] = useState<
    string | null
  >(null);
  const [draftRoles, setDraftRoles] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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
      const error = new Error(payload.message || "Unable to complete request");
      (error as Error & { status?: number }).status = response.status;
      throw error;
    }

    return payload.data as T;
  };

  const loadOrganizations = async () => {
    const data = await request<OrganizationRecord[]>("/api/admin/organizations");
    const options = data.map((organization) => ({
      id: organization.id,
      name: organization.name,
      maxUsers: organization.maxUsers,
    }));
    setOrganizations(options);

    if (!selectedOrganizationId && options.length) {
      setSelectedOrganizationId(options[0].id);
    } else if (!options.length) {
      setLoading(false);
    }
  };

  const buildScopedQuery = (organizationId?: string) => {
    if (!organizationId) {
      return "";
    }

    return `?organizationId=${encodeURIComponent(organizationId)}`;
  };

  const loadUsersAndEntities = async (organizationId?: string, showRefresh = false) => {
    if (showRefresh) {
      setRefreshing(true);
    }

    try {
      setError(null);
      setForbidden(false);
      const query = buildScopedQuery(organizationId);
      const [usersData, entitiesData] = await Promise.all([
        request<UsersPayload>(`/api/organization/users${query}`),
        request<OrganizationEntityRecord[]>(`/api/organization/entities${query}`),
      ]);

      setUsersPayload(usersData);
      setEntities(entitiesData);
      setDraftRoles(
        Object.fromEntries(
          usersData.users.map((user) => [user.organizationUserId, user.role])
        )
      );
    } catch (loadError) {
      if ((loadError as Error & { status?: number }).status === 403) {
        setForbidden(true);
        setUsersPayload(null);
        setEntities([]);
      } else {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load organization users"
        );
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!router.isReady) return;

    const role = localStorage.getItem("role");
    const admin = role === "ADMIN";
    setIsSuperAdmin(admin);

    const boot = async () => {
      try {
        if (admin) {
          await loadOrganizations();
        } else {
          await loadUsersAndEntities();
        }
      } catch (bootError) {
        setLoading(false);
        setError(
          bootError instanceof Error
            ? bootError.message
            : "Unable to load user management"
        );
      }
    };

    boot();
  }, [router.isReady]);

  useEffect(() => {
    if (!isSuperAdmin || !selectedOrganizationId) return;
    loadUsersAndEntities(selectedOrganizationId);
  }, [isSuperAdmin, selectedOrganizationId]);

  const selectedOrganization = usersPayload?.organization;
  const remainingSeats = useMemo(() => {
    if (!selectedOrganization) return "—";
    return Math.max(
      selectedOrganization.maxUsers - selectedOrganization.activeUsersCount,
      0
    );
  }, [selectedOrganization]);

  const handleInternalSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmittingInternal(true);
    setError(null);
    setSuccess(null);

    try {
      await request("/api/organization/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          organizationId: isSuperAdmin ? selectedOrganizationId : undefined,
          email: internalForm.email,
          temporaryPassword: internalForm.temporaryPassword,
          role: internalForm.role,
        }),
      });

      setInternalForm(initialInternalUserForm());
      setSuccess("Internal user created. Password change will be required on first login.");
      await loadUsersAndEntities(isSuperAdmin ? selectedOrganizationId : undefined);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to create internal user"
      );
    } finally {
      setSubmittingInternal(false);
    }
  };

  const handleClientSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmittingClient(true);
    setError(null);
    setSuccess(null);

    try {
      await request("/api/organization/client-users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          organizationId: isSuperAdmin ? selectedOrganizationId : undefined,
          email: clientForm.email,
          temporaryPassword: clientForm.temporaryPassword,
          entityIds: clientForm.entityIds,
          entityRole: clientForm.entityRole,
        }),
      });

      setClientForm(initialClientUserForm());
      setSuccess("Client access created. Password change will be required on first login.");
      await loadUsersAndEntities(isSuperAdmin ? selectedOrganizationId : undefined);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to create client access"
      );
    } finally {
      setSubmittingClient(false);
    }
  };

  const updateOrganizationUser = async (
    organizationUserId: string,
    payload: { role?: string; isActive?: boolean }
  ) => {
    setUpdatingOrganizationUserId(organizationUserId);
    setError(null);
    setSuccess(null);

    try {
      await request(`/api/organization/users/${organizationUserId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      setSuccess("User access updated.");
      await loadUsersAndEntities(isSuperAdmin ? selectedOrganizationId : undefined);
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Unable to update user access"
      );
    } finally {
      setUpdatingOrganizationUserId(null);
    }
  };

  if (loading) {
    return (
      <main className={cn(PAGE_BG, "min-h-screen px-6 py-20 text-black")}>
        <div className="mx-auto max-w-7xl">
          <div className={cn(CARD, "animate-pulse p-8")}>
            <div className="h-6 w-40 rounded-full bg-black/5" />
            <div className="mt-6 h-10 w-72 rounded-2xl bg-black/5" />
            <div className="mt-6 grid gap-4 md:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-24 rounded-3xl bg-black/5" />
              ))}
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (forbidden) {
    return (
      <main className={cn(PAGE_BG, "min-h-screen px-6 py-20 text-black")}>
        <div className="mx-auto max-w-3xl">
          <div className={cn(CARD, "p-8 text-center")}>
            <h1 className="text-2xl font-bold tracking-[-0.04em]">
              User management unavailable
            </h1>
            <p className="mt-3 text-sm font-medium text-black/50">
              You do not have permission to manage organization users.
            </p>
            <button
              type="button"
              onClick={() => router.push("/dashboard")}
              className={cn(BUTTON_DARK, "mt-6")}
            >
              Back to dashboard
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={cn(PAGE_BG, "min-h-screen px-6 py-6 text-black")}>
      <div className="mx-auto max-w-7xl">
        <header className={cn(CARD, "p-6")}>
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <LogoMark />
              <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-500">
                Organization access
              </p>
              <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em]">
                User Management
              </h1>
              <p className="mt-3 text-sm font-medium text-black/50">
                Manage internal users and client access.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => loadUsersAndEntities(isSuperAdmin ? selectedOrganizationId : undefined, true)}
                disabled={refreshing}
                className={BUTTON_DARK}
              >
                {refreshing ? "Refreshing..." : "Refresh"}
              </button>
              <button
                type="button"
                onClick={() => router.push("/dashboard")}
                className="rounded-full border border-black px-4 py-2.5 text-xs font-semibold text-black transition hover:bg-black hover:text-white"
              >
                Back to dashboard
              </button>
            </div>
          </div>

          {isSuperAdmin && (
            <div className="mt-5 max-w-sm">
              <label>
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                  Organization
                </span>
                <select
                  value={selectedOrganizationId}
                  onChange={(event) => setSelectedOrganizationId(event.target.value)}
                  className={INPUT}
                >
                  {organizations.map((organization) => (
                    <option key={organization.id} value={organization.id}>
                      {organization.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
        </header>

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

        <section className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Max internal users"
            value={selectedOrganization?.maxUsers ?? "—"}
            accent
          />
          <KpiCard
            label="Active internal users"
            value={selectedOrganization?.activeUsersCount ?? "—"}
          />
          <KpiCard label="Remaining seats" value={remainingSeats} />
          <KpiCard
            label="Clients"
            value={selectedOrganization?.clientUsersCount ?? usersPayload?.clientUsers?.length ?? "—"}
          />
        </section>

        <section className="mt-4 grid gap-4 xl:grid-cols-[1fr_1fr]">
          <div className={cn(CARD, "p-5")}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-500">
              Internal users
            </p>
            <h2 className="mt-3 text-xl font-semibold tracking-[-0.03em]">
              Create internal user
            </h2>
            <p className="mt-2 text-sm font-medium text-black/45">
              User will be required to change this password on first login.
            </p>

            <form onSubmit={handleInternalSubmit} className="mt-5 grid gap-4">
              <label>
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                  Email
                </span>
                <input
                  required
                  type="email"
                  value={internalForm.email}
                  onChange={(event) =>
                    setInternalForm((current) => ({
                      ...current,
                      email: event.target.value,
                    }))
                  }
                  className={INPUT}
                />
              </label>

              <label>
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                  Temporary password
                </span>
                <input
                  required
                  minLength={8}
                  value={internalForm.temporaryPassword}
                  onChange={(event) =>
                    setInternalForm((current) => ({
                      ...current,
                      temporaryPassword: event.target.value,
                    }))
                  }
                  className={INPUT}
                />
              </label>

              <label>
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                  Role
                </span>
                <select
                  value={internalForm.role}
                  onChange={(event) =>
                    setInternalForm((current) => ({
                      ...current,
                      role: event.target.value,
                    }))
                  }
                  className={INPUT}
                >
                  {INTERNAL_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </label>

              <div>
                <button
                  type="submit"
                  disabled={submittingInternal}
                  className={BUTTON_BLUE}
                >
                  {submittingInternal ? "Creating..." : "Create internal user"}
                </button>
              </div>
            </form>

            <div className="mt-8 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-[#f7f7f9] text-[11px] font-semibold uppercase tracking-[0.14em] text-black/40">
                  <tr>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Active</th>
                    <th className="px-4 py-3">Must change</th>
                    <th className="px-4 py-3">Created</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {usersPayload?.users.length ? (
                    usersPayload.users.map((user) => (
                      <tr className="transition hover:bg-black/[0.02]" key={user.organizationUserId}>
                        <td className="px-4 py-4 font-semibold">{user.email}</td>
                        <td className="px-4 py-4">
                          <select
                            value={draftRoles[user.organizationUserId] || user.role}
                            onChange={(event) =>
                              setDraftRoles((current) => ({
                                ...current,
                                [user.organizationUserId]: event.target.value,
                              }))
                            }
                            className="rounded-xl border border-black/10 bg-white px-3 py-2 text-xs font-bold"
                          >
                            {INTERNAL_ROLES.map((role) => (
                              <option key={role} value={role}>
                                {role}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-4 font-medium text-black/60">
                          {user.isActive ? "Yes" : "No"}
                        </td>
                        <td className="px-4 py-4 font-medium text-black/60">
                          {user.mustChangePassword ? "Yes" : "No"}
                        </td>
                        <td className="px-4 py-4 font-medium text-black/60">
                          {formatDate(user.createdAt)}
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              disabled={updatingOrganizationUserId === user.organizationUserId}
                              onClick={() =>
                                updateOrganizationUser(user.organizationUserId, {
                                  role: draftRoles[user.organizationUserId] || user.role,
                                })
                              }
                              className="rounded-full border border-black/10 px-3 py-2 text-[10px] font-semibold transition hover:border-black hover:bg-black hover:text-white"
                            >
                              Save role
                            </button>
                            <button
                              type="button"
                              disabled={updatingOrganizationUserId === user.organizationUserId}
                              onClick={() =>
                                updateOrganizationUser(user.organizationUserId, {
                                  isActive: !user.isActive,
                                })
                              }
                              className="rounded-full bg-black px-3 py-2 text-[10px] font-semibold text-white transition hover:bg-slate-800"
                            >
                              {user.isActive ? "Deactivate" : "Activate"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-8 text-center text-sm font-medium text-black/45"
                      >
                        No internal users yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className={cn(CARD, "p-5")}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-500">
              Client access
            </p>
            <h2 className="mt-3 text-xl font-semibold tracking-[-0.03em]">
              Create client user
            </h2>

            <form onSubmit={handleClientSubmit} className="mt-5 grid gap-4">
              <label>
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                  Email
                </span>
                <input
                  required
                  type="email"
                  value={clientForm.email}
                  onChange={(event) =>
                    setClientForm((current) => ({
                      ...current,
                      email: event.target.value,
                    }))
                  }
                  className={INPUT}
                />
              </label>

              <label>
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                  Temporary password
                </span>
                <input
                  required
                  minLength={8}
                  value={clientForm.temporaryPassword}
                  onChange={(event) =>
                    setClientForm((current) => ({
                      ...current,
                      temporaryPassword: event.target.value,
                    }))
                  }
                  className={INPUT}
                />
              </label>

              <label>
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                  Access role
                </span>
                <select
                  value={clientForm.entityRole}
                  onChange={(event) =>
                    setClientForm((current) => ({
                      ...current,
                      entityRole: event.target.value,
                    }))
                  }
                  className={INPUT}
                >
                  {CLIENT_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </label>

              <div>
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                  Entity access
                </span>
                <div className="grid gap-3 rounded-2xl border border-black/10 bg-[#f7f7f9] p-4">
                  {entities.length ? (
                    entities.map((entity) => (
                      <label
                        key={entity.id}
                        className="flex items-start gap-3 rounded-2xl bg-white px-4 py-3"
                      >
                        <input
                          type="checkbox"
                          checked={clientForm.entityIds.includes(entity.id)}
                          onChange={(event) =>
                            setClientForm((current) => ({
                              ...current,
                              entityIds: event.target.checked
                                ? [...current.entityIds, entity.id]
                                : current.entityIds.filter((id) => id !== entity.id),
                            }))
                          }
                          className="mt-1"
                        />
                        <div>
                          <p className="text-sm font-semibold">{entity.name}</p>
                          <p className="mt-1 text-xs font-medium text-black/45">
                            {entity.type} · {entity.baseCurrency} ·{" "}
                            {entity.isActive ? "Active" : "Inactive"}
                          </p>
                        </div>
                      </label>
                    ))
                  ) : (
                    <p className="text-sm font-medium text-black/45">
                      No entities available for access assignment.
                    </p>
                  )}
                </div>
              </div>

              <div>
                <button
                  type="submit"
                  disabled={submittingClient}
                  className={BUTTON_BLUE}
                >
                  {submittingClient ? "Creating..." : "Create client access"}
                </button>
              </div>
            </form>

            <div className="mt-8 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-[#f7f7f9] text-[11px] font-semibold uppercase tracking-[0.14em] text-black/40">
                  <tr>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Entity access</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Must change</th>
                    <th className="px-4 py-3">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {usersPayload?.clientUsers?.length ? (
                    usersPayload.clientUsers.map((user) => (
                      <tr className="transition hover:bg-black/[0.02]" key={user.id}>
                        <td className="px-4 py-4 font-semibold">{user.email}</td>
                        <td className="px-4 py-4 text-xs font-medium text-black/60">
                          {user.entityAccess.length
                            ? user.entityAccess
                                .map((access) => access.entityName)
                                .join(", ")
                            : "—"}
                        </td>
                        <td className="px-4 py-4 text-xs font-bold">
                          {user.entityAccess.length
                            ? Array.from(
                                new Set(user.entityAccess.map((access) => access.role))
                              ).join(", ")
                            : "—"}
                        </td>
                        <td className="px-4 py-4 font-medium text-black/60">
                          {user.mustChangePassword ? "Yes" : "No"}
                        </td>
                        <td className="px-4 py-4 font-medium text-black/60">
                          {formatDate(user.createdAt)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-4 py-8 text-center text-sm font-medium text-black/45"
                      >
                        No client users yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
