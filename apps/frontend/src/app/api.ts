export type ApiHealth = {
  status: string;
  zabbix_connected: boolean;
};

export type Host = {
  hostid: string;
  host: string;
  name?: string;
  status: string;
};

export type TeamUser = {
  id: number;
  username: string;
  email: string;
  roles: string[];
};

export type UserRow = {
  id: number;
  username: string;
  email: string;
  roles: string[];
  team_id: number | null;
  team_name: string | null;
};

export type Team = {
  id: number;
  name: string;
  description: string;
  users: TeamUser[];
  hosts: string[];
};

import { clearToken, getToken } from "../lib/auth";

const extractDetail = async (res: Response, fallback: string): Promise<string> => {
  try {
    const json: unknown = await res.json();
    if (json && typeof json === "object" && "detail" in json) {
      const d = (json as { detail?: unknown }).detail;
      if (typeof d === "string") return d;
    }
  } catch {
    // ignore
  }
  return fallback;
};

const apiFetch = async <T>(path: string, init?: RequestInit, opts?: { skipRedirect?: boolean }): Promise<T> => {
  const token = getToken();
  const headers = new Headers(init?.headers as HeadersInit | undefined);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`/api${path}`, { ...init, headers });
  if (!res.ok) {
    if (res.status === 401 && !opts?.skipRedirect) {
      clearToken();
      window.location.href = "/login";
      throw new Error("Session expired");
    }
    throw new Error(await extractDetail(res, `HTTP ${res.status}`));
  }
  return (await res.json()) as T;
};

export const api = {
  health: () => apiFetch<ApiHealth>("/health"),
  listHosts: () => apiFetch<{ count: number; hosts: Host[] }>("/hosts"),
  createHost: (payload: { hostname: string; ip: string; template?: string }) =>
    apiFetch<{ message: string; hostid: string }>("/hosts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  bulkCreateHosts: (file: File) => {
    const body = new FormData();
    body.append("file", file);
    return apiFetch<{
      message: string;
      total_rows: number;
      created_count: number;
      failed_count: number;
      created: Array<{ row: number; hostname: string; hostid: string }>;
      failed: Array<{ row: number; hostname?: string; reason: string }>;
    }>("/hosts/bulk", {
      method: "POST",
      body,
    });
  },
  deleteHost: (hostname: string) =>
    apiFetch<{ message: string }>(`/hosts/${encodeURIComponent(hostname)}`, { method: "DELETE" }),
  addItem: (payload: {
    hostname: string;
    item_name: string;
    item_key: string;
    value_type?: number;
  }) =>
    apiFetch<{ message: string; itemid: string }>("/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  listItems: (hostname: string) =>
    apiFetch<{ items: Array<{ itemid: string; name: string; key_: string; value_type: string; delay: string }> }>(
      `/items/${encodeURIComponent(hostname)}`,
    ),

  deleteItem: (itemid: string) =>
    apiFetch<{ message: string }>(`/items/${itemid}`, { method: "DELETE" }),

  listTriggers: (hostname: string) =>
    apiFetch<{ triggers: Array<{ triggerid: string; description: string; expression: string; priority: string; status: string }> }>(
      `/triggers/${encodeURIComponent(hostname)}`,
    ),

  deleteTrigger: (triggerid: string) =>
    apiFetch<{ message: string }>(`/triggers/${triggerid}`, { method: "DELETE" }),

  addTrigger: (payload: {
    hostname: string;
    item_key: string;
    trigger_name: string;
    threshold: number;
    operator?: string;
    severity?: number;
  }) =>
    apiFetch<{ message: string; triggerid: string }>("/triggers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),

  // ── Auth ─────────────────────────────────────────────────────────────
  login: (username: string, password: string) =>
    apiFetch<{ access_token: string; token_type: string; user: { id: number; username: string; role: string; team_id: number | null } }>(
      "/auth/login",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) },
      { skipRedirect: true },
    ),

  me: () => apiFetch<{ sub: string; username: string; role: string; team_id: number | null }>("/auth/me"),

  // ── Teams ────────────────────────────────────────────────────────────
  getTeamsOverview: () => apiFetch<{ teams: Team[] }>("/teams/overview"),

  createTeam: (payload: { name: string; description?: string }) =>
    apiFetch<{ id: number; name: string; description: string }>("/teams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),

  deleteTeam: (teamId: number) =>
    apiFetch<{ message: string }>(`/teams/${teamId}`, { method: "DELETE" }),

  assignHost: (teamId: number, hostname: string) =>
    apiFetch<{ message: string }>(`/teams/${teamId}/hosts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hostname }),
    }),

  unassignHost: (teamId: number, hostname: string) =>
    apiFetch<{ message: string }>(
      `/teams/${teamId}/hosts/${encodeURIComponent(hostname)}`,
      { method: "DELETE" },
    ),

  // ── Users ────────────────────────────────────────────────────────────
  createUser: (payload: { username: string; password: string; email?: string; roles?: string[]; team_id?: number }) =>
    apiFetch<{ id: number; username: string; roles: string[]; team_id: number | null }>("/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),

  listUsers: () =>
    apiFetch<{ users: UserRow[] }>("/users"),

  updateUser: (userId: number, payload: { roles: string[]; team_id: number | null }) =>
    apiFetch<{ message: string }>(`/users/${userId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),

  deleteUser: (userId: number) =>
    apiFetch<{ message: string }>(`/users/${userId}`, { method: "DELETE" }),

  changePassword: (userId: number, newPassword: string) =>
    apiFetch<{ message: string }>(`/users/${userId}/password`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ new_password: newPassword }),
    }),
};
