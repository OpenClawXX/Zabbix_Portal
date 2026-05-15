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

const apiFetch = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(`/api${path}`, init);
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const json: unknown = await res.json();
      if (json && typeof json === "object" && "detail" in json) {
        const d = (json as { detail?: unknown }).detail;
        if (typeof d === "string") detail = d;
      }
    } catch {
      // ignore
    }
    throw new Error(detail);
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
};
