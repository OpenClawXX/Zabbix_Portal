"use client";
import AssessmentOutlinedIcon from "@mui/icons-material/AssessmentOutlined";
import RefreshIcon from "@mui/icons-material/Refresh";
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  CircularProgress,
  FormControl,
  InputLabel,
  LinearProgress,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { api } from "../app/api";

const SEV_COLORS: Record<number, string> = {
  5: "#B71C1C", 4: "#F44336", 3: "#FF5722", 2: "#FFC107", 1: "#2196F3", 0: "#9E9E9E",
};

const fmtTs = (ts: number) =>
  ts ? new Date(ts * 1000).toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" }) : "—";

const TIME_OPTS = [
  { label: "1h", hours: 1 }, { label: "6h", hours: 6 }, { label: "24h", hours: 24 },
  { label: "7d", hours: 168 }, { label: "30d", hours: 720 },
];

const TimeBar = ({ hours, onChange }: { hours: number; onChange: (h: number) => void }) => (
  <Box sx={{ display: "flex", gap: 0.5 }}>
    {TIME_OPTS.map((o) => (
      <Button key={o.label} size="small" variant={hours === o.hours ? "contained" : "outlined"}
        onClick={() => onChange(o.hours)} sx={{ minWidth: 40, px: 1, fontSize: "0.72rem", textTransform: "none" }}>
        {o.label}
      </Button>
    ))}
  </Box>
);

// ── Availability ──────────────────────────────────────────────────────

const AvailabilityTab = () => {
  const [hours, setHours] = useState(24);
  const [data, setData] = useState<Array<{ hostid: string; hostname: string; availability_pct: number; downtime_seconds: number; problem_count: number }>>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api.getAvailability({ hours }).then((r) => setData(r.hosts)).catch(() => {}).finally(() => setLoading(false));
  }, [hours]);
  useEffect(() => { void load(); }, [load]);

  return (
    <Stack spacing={2}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
        <TimeBar hours={hours} onChange={setHours} />
        <Button size="small" variant="outlined" startIcon={<RefreshIcon />} onClick={load} disabled={loading}>Refresh</Button>
        {loading && <CircularProgress size={14} />}
      </Box>
      <Alert severity="info" sx={{ py: 0.5 }}>Availability is calculated from Zabbix problems in the selected window. Hosts with no problems show 100%.</Alert>
      <TableContainer sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1.5 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>Host</TableCell>
              <TableCell sx={{ fontWeight: 700, width: 200 }}>Availability</TableCell>
              <TableCell sx={{ fontWeight: 700, width: 100 }}>Uptime %</TableCell>
              <TableCell sx={{ fontWeight: 700, width: 120 }}>Downtime</TableCell>
              <TableCell sx={{ fontWeight: 700, width: 80 }}>Problems</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {data.length === 0 && !loading && (
              <TableRow><TableCell colSpan={5}><Typography variant="body2" color="text.disabled" sx={{ py: 1 }}>No data — all hosts may be 100% available.</Typography></TableCell></TableRow>
            )}
            {data.map((h) => {
              const pct = h.availability_pct;
              const color = pct >= 99 ? "#22C55E" : pct >= 95 ? "#F59E0B" : "#EF4444";
              const downMins = Math.floor(h.downtime_seconds / 60);
              const downStr = downMins >= 60 ? `${Math.floor(downMins / 60)}h ${downMins % 60}m` : `${downMins}m`;
              return (
                <TableRow key={h.hostid} hover>
                  <TableCell><Typography variant="body2" sx={{ fontWeight: 500 }}>{h.hostname}</Typography></TableCell>
                  <TableCell>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <LinearProgress variant="determinate" value={pct} sx={{ flex: 1, height: 6, borderRadius: 3, bgcolor: "rgba(255,255,255,0.08)", "& .MuiLinearProgress-bar": { bgcolor: color, borderRadius: 3 } }} />
                    </Box>
                  </TableCell>
                  <TableCell><Typography variant="body2" sx={{ fontWeight: 700, color }}>{pct.toFixed(2)}%</Typography></TableCell>
                  <TableCell><Typography variant="body2" color="text.secondary">{h.downtime_seconds > 0 ? downStr : "—"}</Typography></TableCell>
                  <TableCell><Typography variant="body2" color="text.secondary">{h.problem_count}</Typography></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Stack>
  );
};

// ── Top Triggers ──────────────────────────────────────────────────────

const TopTriggersTab = () => {
  const [hours, setHours] = useState(24);
  const [severityMin, setSeverityMin] = useState(0);
  const [data, setData] = useState<Array<{ triggerid: string; description: string; priority: number; severity_label: string; lastchange: number; hosts: Array<{ host: string }> }>>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api.getTopTriggers({ limit: 100, severity_min: severityMin, hours }).then((r) => setData(r.triggers)).catch(() => {}).finally(() => setLoading(false));
  }, [hours, severityMin]);
  useEffect(() => { void load(); }, [load]);

  return (
    <Stack spacing={2}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
        <TimeBar hours={hours} onChange={setHours} />
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>Min severity</InputLabel>
          <Select label="Min severity" value={severityMin} onChange={(e) => setSeverityMin(Number(e.target.value))}>
            <MenuItem value={0}>All</MenuItem>
            <MenuItem value={2}>Low+</MenuItem>
            <MenuItem value={3}>Medium+</MenuItem>
            <MenuItem value={4}>High+</MenuItem>
            <MenuItem value={5}>Critical only</MenuItem>
          </Select>
        </FormControl>
        <Button size="small" variant="outlined" startIcon={<RefreshIcon />} onClick={load} disabled={loading}>Refresh</Button>
        {loading && <CircularProgress size={14} />}
      </Box>
      <TableContainer sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1.5, maxHeight: 560, overflow: "auto" }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>Trigger</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Host</TableCell>
              <TableCell sx={{ fontWeight: 700, width: 100 }}>Severity</TableCell>
              <TableCell sx={{ fontWeight: 700, width: 140 }}>Last fired</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {data.length === 0 && !loading && (
              <TableRow><TableCell colSpan={4}><Typography variant="body2" color="text.disabled" sx={{ py: 1 }}>No triggers fired in this window.</Typography></TableCell></TableRow>
            )}
            {data.map((t) => (
              <TableRow key={t.triggerid} hover>
                <TableCell><Typography variant="body2">{t.description}</Typography></TableCell>
                <TableCell><Typography variant="body2" color="text.secondary">{t.hosts.map((h) => h.host).join(", ")}</Typography></TableCell>
                <TableCell>
                  <Chip label={t.severity_label} size="small" sx={{ height: 18, fontSize: "0.62rem", color: SEV_COLORS[t.priority], bgcolor: `${SEV_COLORS[t.priority]}18`, border: `1px solid ${SEV_COLORS[t.priority]}40` }} />
                </TableCell>
                <TableCell><Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>{fmtTs(t.lastchange)}</Typography></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Stack>
  );
};

// ── Audit Log ────────────────────────────────────────────────────────

const AuditLogTab = () => {
  const [hours, setHours] = useState(24);
  const [data, setData] = useState<Array<{ auditid: string; username: string; clock: number; action: string; resourcetype: string; resourcename: string; ip: string; details: string }>>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api.getAuditLog({ limit: 200, hours }).then((r) => setData(r.entries)).catch(() => {}).finally(() => setLoading(false));
  }, [hours]);
  useEffect(() => { void load(); }, [load]);

  return (
    <Stack spacing={2}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
        <TimeBar hours={hours} onChange={setHours} />
        <Button size="small" variant="outlined" startIcon={<RefreshIcon />} onClick={load} disabled={loading}>Refresh</Button>
        {loading && <CircularProgress size={14} />}
        <Chip label={`${data.length} entries`} size="small" sx={{ height: 20, fontSize: "0.65rem" }} />
      </Box>
      <TableContainer sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1.5, maxHeight: 560, overflow: "auto" }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700, width: 140 }}>Time</TableCell>
              <TableCell sx={{ fontWeight: 700, width: 120 }}>User</TableCell>
              <TableCell sx={{ fontWeight: 700, width: 90 }}>Action</TableCell>
              <TableCell sx={{ fontWeight: 700, width: 130 }}>Resource type</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Resource</TableCell>
              <TableCell sx={{ fontWeight: 700, width: 120 }}>IP</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {data.length === 0 && !loading && (
              <TableRow><TableCell colSpan={6}><Typography variant="body2" color="text.disabled" sx={{ py: 1 }}>No audit entries in this window.</Typography></TableCell></TableRow>
            )}
            {data.map((e) => (
              <TableRow key={e.auditid} hover>
                <TableCell sx={{ fontFamily: "monospace", fontSize: "0.72rem", color: "text.secondary", whiteSpace: "nowrap" }}>{fmtTs(e.clock)}</TableCell>
                <TableCell><Typography variant="body2" sx={{ fontWeight: 500 }}>{e.username || "—"}</Typography></TableCell>
                <TableCell><Chip label={e.action} size="small" variant="outlined" sx={{ height: 18, fontSize: "0.6rem" }} /></TableCell>
                <TableCell><Typography variant="body2" color="text.secondary">{e.resourcetype}</Typography></TableCell>
                <TableCell><Typography variant="body2" noWrap sx={{ maxWidth: 280 }}>{e.resourcename || "—"}</Typography></TableCell>
                <TableCell><Typography variant="caption" sx={{ fontFamily: "monospace", color: "text.disabled" }}>{e.ip || "—"}</Typography></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Stack>
  );
};

// ── Action Log ────────────────────────────────────────────────────────

const STATUS_COLORS: Record<number, string> = { 0: "#22C55E", 1: "#F59E0B", 2: "#EF4444" };
const STATUS_LABELS: Record<number, string> = { 0: "Sent", 1: "In progress", 2: "Failed" };

const ActionLogTab = () => {
  const [hours, setHours] = useState(24);
  const [data, setData] = useState<Array<{ alertid: string; clock: number; subject: string; sendto: string; status: number; error: string; alerttype: number }>>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api.getActionLog({ limit: 200, hours }).then((r) => setData(r.entries)).catch(() => {}).finally(() => setLoading(false));
  }, [hours]);
  useEffect(() => { void load(); }, [load]);

  return (
    <Stack spacing={2}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
        <TimeBar hours={hours} onChange={setHours} />
        <Button size="small" variant="outlined" startIcon={<RefreshIcon />} onClick={load} disabled={loading}>Refresh</Button>
        {loading && <CircularProgress size={14} />}
        <Chip label={`${data.length} entries`} size="small" sx={{ height: 20, fontSize: "0.65rem" }} />
      </Box>
      <TableContainer sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1.5, maxHeight: 560, overflow: "auto" }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700, width: 140 }}>Time</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Subject</TableCell>
              <TableCell sx={{ fontWeight: 700, width: 180 }}>Sent to</TableCell>
              <TableCell sx={{ fontWeight: 700, width: 100 }}>Status</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Error</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {data.length === 0 && !loading && (
              <TableRow><TableCell colSpan={5}><Typography variant="body2" color="text.disabled" sx={{ py: 1 }}>No actions sent in this window.</Typography></TableCell></TableRow>
            )}
            {data.map((a) => (
              <TableRow key={a.alertid} hover>
                <TableCell sx={{ fontFamily: "monospace", fontSize: "0.72rem", color: "text.secondary", whiteSpace: "nowrap" }}>{fmtTs(a.clock)}</TableCell>
                <TableCell><Typography variant="body2" noWrap sx={{ maxWidth: 300 }}>{a.subject || "—"}</Typography></TableCell>
                <TableCell><Typography variant="body2" color="text.secondary" noWrap sx={{ maxWidth: 170 }}>{a.sendto || "—"}</Typography></TableCell>
                <TableCell>
                  <Chip label={STATUS_LABELS[a.status] ?? String(a.status)} size="small"
                    sx={{ height: 18, fontSize: "0.62rem", color: STATUS_COLORS[a.status] ?? "#9E9E9E", bgcolor: `${STATUS_COLORS[a.status] ?? "#9E9E9E"}18`, border: `1px solid ${STATUS_COLORS[a.status] ?? "#9E9E9E"}40` }} />
                </TableCell>
                <TableCell><Typography variant="caption" color="error.light" noWrap sx={{ maxWidth: 200 }}>{a.error || "—"}</Typography></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Stack>
  );
};

// ── Main ──────────────────────────────────────────────────────────────

const TAB_SLUGS = ["availability", "top-triggers", "audit-log", "action-log"];

const ReportsInner = () => {
  const searchParams = useSearchParams();
  const tab = Math.max(0, TAB_SLUGS.indexOf(searchParams.get("tab") ?? ""));

  return (
    <Stack spacing={3}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
        <AssessmentOutlinedIcon sx={{ fontSize: 28, color: "primary.main" }} />
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>Reports</Typography>
          <Typography variant="body2" color="text.secondary">Availability, top triggers, audit log, and action log.</Typography>
        </Box>
      </Box>
      <Card>
        <Box sx={{ p: 2 }}>
          {tab === 0 && <AvailabilityTab />}
          {tab === 1 && <TopTriggersTab />}
          {tab === 2 && <AuditLogTab />}
          {tab === 3 && <ActionLogTab />}
        </Box>
      </Card>
    </Stack>
  );
};

export const Reports = () => (
  <Suspense fallback={null}>
    <ReportsInner />
  </Suspense>
);
