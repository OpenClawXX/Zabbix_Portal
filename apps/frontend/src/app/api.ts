export type WidgetConfig = {
  i: string;
  graphid: string;
  graphName: string;
  mode: "native" | "chartjs";
  periodIdx: number;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type MetricWidgetConfig = {
  i: string;
  hostname: string;
  itemid: string;
  itemName: string;
  units: string;
  periodIdx: number;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type DashboardLayoutData = {
  widgets: WidgetConfig[];
  scope: "user" | "team";
};

export type MetricLayoutData = {
  widgets: MetricWidgetConfig[];
  scope: "user" | "team";
};

export type DashboardGraph = {
  graphid: string;
  name: string;
  width: string;
  height: string;
  graphtype: string;
  hosts: { hostid: string; host: string }[];
};

export type GraphSeries = {
  itemid: string;
  name: string;
  units: string;
  color: string;
  points: HistoryPoint[];
};

export type GraphData = {
  graph: { graphid: string; name: string };
  series: GraphSeries[];
};

export type HostMetrics = {
  hostid: string;
  hostname: string;
  cpu_util?: number;
  mem_util?: number;
  disk_util?: number;
};

export type RecentItem = {
  itemid: string;
  name: string;
  key_: string;
  value_type: string;
  delay: string;
  lastvalue: string;
  units: string;
  lastclock: number | null;
  hostname: string;
};

export type AlertRule = {
  id: number;
  item_id: string;
  item_name: string;
  hostname: string;
  operator: ">" | "<" | ">=" | "<=";
  threshold: number;
  severity: number;
  enabled: boolean;
  is_firing: boolean;
  created_at: string;
};

export type AlertEvent = {
  id: number;
  rule_id: number;
  item_id: string; // Zabbix item ID — used to match events to chart widgets
  item_name: string;
  hostname: string;
  operator: string;
  threshold: number;
  actual_value: number;
  severity: number;
  fired_at: number; // unix timestamp
};

export type Problem = {
  eventid: string;
  hostname: string;
  severity: number;
  severity_name: string;
  name: string;
  clock: number;
  age_seconds: number;
  acknowledged: boolean;
};

// Persisted notification history entry (stored in localStorage)
export type StoredNotif = {
  id: string; // eventid for Zabbix problems, "rule-{id}" for custom rules
  source: "zabbix" | "rule";
  hostname: string;
  severity: number;
  name: string;
  clock: number; // unix timestamp
  acknowledged: boolean;
};

export type HistoryPoint = { clock: number; value: number };

export type ItemHistory = {
  history: HistoryPoint[];
  item_name: string;
  units: string;
};

export type ApiHealth = {
  status: string;
  zabbix_connected: boolean;
};

export type HostInterface = {
  ip: string;
  port: string;
  type: string; // "1"=Agent "2"=SNMP "3"=IPMI "4"=JMX
  available: string; // "0"=Unknown "1"=Available "2"=Unavailable
};

export type Host = {
  hostid: string;
  host: string;
  name?: string;
  status: string;
  interfaces?: HostInterface[];
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

const apiFetchBlob = async (path: string): Promise<Blob | null> => {
  const token = getToken();
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  try {
    const res = await fetch(`/api${path}`, { headers });
    if (!res.ok) return null;
    return res.blob();
  } catch {
    return null;
  }
};

const apiFetch = async <T>(
  path: string,
  init?: RequestInit,
  opts?: { skipRedirect?: boolean },
): Promise<T> => {
  const token = getToken();
  const headers = new Headers(init?.headers as HeadersInit | undefined);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  // Any request with a body is JSON. Without this header the browser sends
  // text/plain, which FastAPI refuses to parse into the model → 422.
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
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
  listItems: (hostname: string, includeInherited = false) =>
    apiFetch<{
      items: Array<{
        itemid: string;
        name: string;
        key_: string;
        value_type: string;
        delay: string;
      }>;
    }>(
      `/items/${encodeURIComponent(hostname)}${includeInherited ? "?include_inherited=true" : ""}`,
    ),

  deleteItem: (itemid: string) =>
    apiFetch<{ message: string }>(`/items/${itemid}`, { method: "DELETE" }),

  listTriggers: (hostname: string) =>
    apiFetch<{
      triggers: Array<{
        triggerid: string;
        description: string;
        expression: string;
        priority: string;
        status: string;
      }>;
    }>(`/triggers/${encodeURIComponent(hostname)}`),

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
    apiFetch<{
      access_token: string;
      token_type: string;
      user: { id: number; username: string; role: string; team_id: number | null };
    }>(
      "/auth/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      },
      { skipRedirect: true },
    ),

  me: () =>
    apiFetch<{ sub: string; username: string; role: string; team_id: number | null }>("/auth/me"),

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
    apiFetch<{ message: string }>(`/teams/${teamId}/hosts/${encodeURIComponent(hostname)}`, {
      method: "DELETE",
    }),

  // ── Users ────────────────────────────────────────────────────────────
  createUser: (payload: {
    username: string;
    password: string;
    email?: string;
    roles?: string[];
    team_id?: number;
  }) =>
    apiFetch<{ id: number; username: string; roles: string[]; team_id: number | null }>("/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),

  listUsers: () => apiFetch<{ users: UserRow[] }>("/users"),

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

  // ── Dashboard ────────────────────────────────────────────────────────
  getDashboardGraphs: (hostid?: string) =>
    apiFetch<{ graphs: DashboardGraph[] }>(
      `/dashboard/graphs${hostid ? `?hostid=${encodeURIComponent(hostid)}` : ""}`,
    ),

  getDashboardGraphImage: (graphid: string, period = 3600) =>
    apiFetchBlob(
      `/dashboard/graphs/${encodeURIComponent(graphid)}/image?period=${period}&width=900&height=200`,
    ),

  getDashboardGraphData: (graphid: string, minutes = 360) =>
    apiFetch<GraphData>(`/dashboard/graphs/${encodeURIComponent(graphid)}/data?minutes=${minutes}`),

  getHostsMetrics: () => apiFetch<{ hosts: HostMetrics[] }>("/dashboard/hosts/metrics"),

  getRecentItems: (limit = 30) =>
    apiFetch<{ items: RecentItem[] }>(`/dashboard/items/recent?limit=${limit}`),

  // ── Dashboard layout ─────────────────────────────────────────────────────────
  getDashboardLayout: (scope: "user" | "team" = "user", page = "dashboard") =>
    apiFetch<DashboardLayoutData>(`/dashboard/layout?scope=${scope}&page=${page}`),

  saveDashboardLayout: (scope: "user" | "team", widgets: WidgetConfig[], page = "dashboard") =>
    apiFetch<{ message: string }>(`/dashboard/layout?page=${page}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope, widgets }),
    }),

  getMetricLayout: (scope: "user" | "team" = "user") =>
    apiFetch<MetricLayoutData>(`/dashboard/layout?scope=${scope}&page=metrics`),

  saveMetricLayout: (scope: "user" | "team", widgets: MetricWidgetConfig[]) =>
    apiFetch<{ message: string }>("/dashboard/layout?page=metrics", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope, widgets }),
    }),

  // ── Metrics ──────────────────────────────────────────────────────────
  getProblems: () => apiFetch<{ problems: Problem[] }>("/metrics/problems"),

  getItemHistory: (itemid: string, minutes = 360) =>
    apiFetch<ItemHistory>(`/metrics/history/${encodeURIComponent(itemid)}?minutes=${minutes}`),

  listAlertRules: () => apiFetch<{ rules: AlertRule[] }>("/alerts/rules"),
  createAlertRule: (data: {
    item_id: string;
    item_name: string;
    hostname: string;
    operator: string;
    threshold: number;
    severity: number;
  }) => apiFetch<{ id: number }>("/alerts/rules", { method: "POST", body: JSON.stringify(data) }),
  deleteAlertRule: (id: number) =>
    apiFetch<{ message: string }>(`/alerts/rules/${id}`, { method: "DELETE" }),
  toggleAlertRule: (id: number) =>
    apiFetch<{ enabled: boolean }>(`/alerts/rules/${id}/toggle`, { method: "PATCH" }),
  getAlertEvents: (limit = 200) =>
    apiFetch<{ events: AlertEvent[] }>(`/alerts/events?limit=${limit}`),
  acknowledgeProblem: (eventid: string) =>
    apiFetch<{ message: string }>(`/metrics/problems/${encodeURIComponent(eventid)}/acknowledge`, {
      method: "POST",
    }),
};
