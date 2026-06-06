"use client";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import NotificationsActiveOutlinedIcon from "@mui/icons-material/NotificationsActiveOutlined";
import PersonOutlinedIcon from "@mui/icons-material/PersonOutlined";
import RouterOutlinedIcon from "@mui/icons-material/RouterOutlined";
import StorageOutlinedIcon from "@mui/icons-material/StorageOutlined";
import TuneOutlinedIcon from "@mui/icons-material/TuneOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Grid,
  LinearProgress,
  Skeleton,
  Tooltip,
  Typography,
} from "@mui/material";
import Link from "next/link";
import { useEffect, useState } from "react";
import { type AlertEvent, type Problem, type Team, api } from "../app/api";
import { useAuth } from "../app/context/AuthContext";
import { useSync } from "../app/context/SyncContext";

const SEVERITY = [
  { label: "Not classified", color: "#9E9E9E" },
  { label: "Info", color: "#42A5F5" },
  { label: "Warning", color: "#FF9800" },
  { label: "Average", color: "#F44336" },
  { label: "High", color: "#E91E63" },
  { label: "Disaster", color: "#B71C1C" },
];

const formatAge = (seconds: number): string => {
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
};

const formatEventTime = (ts: number): string => {
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

// ── Stat card ────────────────────────────────────────────────────────────────

const StatCard = ({
  icon,
  label,
  value,
  sub,
  color = "primary.main",
  loading,
  href,
  availability,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  sub?: string;
  color?: string;
  loading: boolean;
  href?: string;
  availability?: { value: number; total: number; color: string };
}) => (
  <Card
    component={href ? Link : "div"}
    href={href}
    sx={{
      height: "100%",
      textDecoration: "none",
      cursor: href ? "pointer" : "default",
      border: "none",
      transition: "transform 0.15s ease, box-shadow 0.15s ease",
      "&:hover": href ? { transform: "translateY(-2px)", boxShadow: 6 } : {},
    }}
  >
    <CardContent sx={{ p: 2.5, pb: "20px !important" }}>
      <Box
        sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", mb: 1.5 }}
      >
        <Box
          sx={{
            width: 38,
            height: 38,
            borderRadius: 2,
            bgcolor: `${color}18`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color,
          }}
        >
          {icon}
        </Box>
        {sub && !loading && (
          <Typography
            variant="caption"
            sx={{ color: "text.disabled", fontSize: "0.68rem", mt: 0.5 }}
          >
            {sub}
          </Typography>
        )}
      </Box>

      {loading ? (
        <>
          <Skeleton variant="text" width={52} height={40} sx={{ mb: 0.25 }} />
          <Skeleton variant="text" width={90} height={16} />
        </>
      ) : (
        <>
          <Typography
            sx={{ fontSize: "2rem", fontWeight: 700, lineHeight: 1.1, letterSpacing: -1, color }}
          >
            {value}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, fontSize: "0.775rem" }}>
            {label}
          </Typography>
        </>
      )}

      {availability && !loading && (
        <Box sx={{ mt: 1.5 }}>
          <LinearProgress
            variant="determinate"
            value={availability.total ? (availability.value / availability.total) * 100 : 0}
            sx={{
              height: 4,
              borderRadius: 2,
              bgcolor: "action.hover",
              "& .MuiLinearProgress-bar": { bgcolor: availability.color, borderRadius: 2 },
            }}
          />
          <Typography
            variant="caption"
            sx={{ color: "text.disabled", fontSize: "0.68rem", mt: 0.5, display: "block" }}
          >
            {availability.value}/{availability.total} available
          </Typography>
        </Box>
      )}
    </CardContent>
  </Card>
);

// ── Problem row ──────────────────────────────────────────────────────────────

const ProblemRow = ({ problem }: { problem: Problem }) => {
  const sev = SEVERITY[Math.min(problem.severity, 5)] ?? SEVERITY[0];
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        py: 1.25,
        "&:not(:last-child)": { borderBottom: "1px solid", borderColor: "divider" },
      }}
    >
      <Box
        sx={{
          width: 3,
          alignSelf: "stretch",
          minHeight: 32,
          borderRadius: 2,
          bgcolor: sev.color,
          flexShrink: 0,
        }}
      />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Tooltip title={problem.name} placement="top-start">
          <Typography
            variant="body2"
            sx={{
              fontWeight: 600,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontSize: "0.8125rem",
            }}
          >
            {problem.name}
          </Typography>
        </Tooltip>
        <Typography variant="caption" color="text.secondary">
          {problem.hostname} · {formatAge(problem.age_seconds)}
        </Typography>
      </Box>
      <Chip
        label={sev.label}
        size="small"
        sx={{
          bgcolor: `${sev.color}18`,
          color: sev.color,
          fontWeight: 700,
          fontSize: "0.65rem",
          height: 20,
          flexShrink: 0,
          border: `1px solid ${sev.color}40`,
        }}
      />
    </Box>
  );
};

// ── Alert event row ──────────────────────────────────────────────────────────

const AlertEventRow = ({ event }: { event: AlertEvent }) => (
  <Box
    sx={{
      display: "flex",
      alignItems: "center",
      gap: 1.5,
      py: 1,
      "&:not(:last-child)": { borderBottom: "1px solid", borderColor: "divider" },
    }}
  >
    <NotificationsActiveOutlinedIcon sx={{ fontSize: 16, color: "warning.main", flexShrink: 0 }} />
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Typography
        variant="body2"
        sx={{
          fontSize: "0.78rem",
          fontWeight: 600,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {event.item_name}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {event.hostname} · {event.operator}
        {event.threshold}
      </Typography>
    </Box>
    <Typography
      variant="caption"
      sx={{ color: "text.disabled", flexShrink: 0, fontSize: "0.68rem" }}
    >
      {formatEventTime(event.fired_at)}
    </Typography>
  </Box>
);

// ── Status row ───────────────────────────────────────────────────────────────

const StatusRow = ({ label, ok, loading }: { label: string; ok: boolean; loading: boolean }) => (
  <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
      <Box
        sx={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          bgcolor: loading ? "action.disabled" : ok ? "success.main" : "error.main",
          boxShadow: loading
            ? "none"
            : ok
              ? "0 0 6px rgba(34,197,94,0.6)"
              : "0 0 6px rgba(239,68,68,0.6)",
        }}
      />
      <Typography variant="body2" color="text.secondary" sx={{ fontSize: "0.8125rem" }}>
        {label}
      </Typography>
    </Box>
    {loading ? (
      <Skeleton variant="rounded" width={48} height={18} />
    ) : (
      <Chip
        size="small"
        label={ok ? "Online" : "Offline"}
        color={ok ? "success" : "error"}
        variant="outlined"
        sx={{ height: 20, fontSize: "0.67rem", fontWeight: 600 }}
      />
    )}
  </Box>
);

// ── Quick action button ──────────────────────────────────────────────────────

const ActionButton = ({
  icon,
  label,
  href,
  external,
  variant = "outlined",
}: {
  icon: React.ReactNode;
  label: string;
  href: string;
  external?: boolean;
  variant?: "contained" | "outlined";
}) => (
  <Button
    component={external ? "a" : Link}
    href={href}
    variant={variant}
    size="small"
    startIcon={icon}
    sx={{ fontSize: "0.78rem", justifyContent: "flex-start", px: 1.5, py: 0.75 }}
    fullWidth
  >
    {label}
  </Button>
);

// ── Main component ───────────────────────────────────────────────────────────

export const Overview = () => {
  const { user } = useAuth();
  const { lastSync } = useSync();

  const [stats, setStats] = useState<{
    totalHosts: number;
    onlineHosts: number;
    totalTeams: number;
    totalUsers: number;
    assignedServers: number;
  } | null>(null);
  const [health, setHealth] = useState<{ ok: boolean; zabbix: boolean } | null>(null);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [alertEvents, setAlertEvents] = useState<AlertEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  })();

  const dateStr = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: lastSync triggers re-fetch on sync events
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [hostsRes, teamsRes, healthRes, problemsRes, eventsRes] = await Promise.all([
          api.listHosts(),
          api.getTeamsOverview(),
          api.health(),
          api.getProblems(),
          api.getAlertEvents(10),
        ]);

        const online = hostsRes.hosts.filter((h) => h.status === "0").length;
        const teams: Team[] = teamsRes.teams;
        const users = teams.reduce((sum, t) => sum + t.users.length, 0);
        const assigned = new Set(teams.flatMap((t) => t.hosts)).size;

        setStats({
          totalHosts: hostsRes.count,
          onlineHosts: online,
          totalTeams: teams.length,
          totalUsers: users,
          assignedServers: assigned,
        });
        setHealth({ ok: healthRes.status === "online", zabbix: !!healthRes.zabbix_connected });
        setProblems(problemsRes.problems ?? []);
        setAlertEvents((eventsRes.events ?? []).slice(0, 6));
      } catch {
        /* individual sections stay in loading / empty state */
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [lastSync]);

  const offlineCount = stats ? stats.totalHosts - stats.onlineHosts : 0;
  const allOk = health?.ok && health?.zabbix;

  const roles = user?.roles ?? [];
  const isAdmin = roles.includes("root") || roles.includes("team_lead");

  return (
    <Box>
      {/* ── Header ── */}
      <Box sx={{ mb: 3.5 }}>
        <Typography variant="h4" sx={{ fontWeight: 700, letterSpacing: -0.5, mb: 0.25 }}>
          {greeting}
          {user?.username ? `, ${user.username}` : ""}
        </Typography>
        <Typography color="text.secondary" sx={{ fontSize: "0.875rem" }}>
          {dateStr}
        </Typography>
      </Box>

      {/* ── Stat cards ── */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} sm={4} md>
          <StatCard
            icon={<StorageOutlinedIcon sx={{ fontSize: 20 }} />}
            label="Total Hosts"
            value={stats?.totalHosts ?? 0}
            sub={offlineCount > 0 ? `${offlineCount} offline` : undefined}
            color="#3B82F6"
            loading={loading}
            href="/hosts"
            availability={
              stats
                ? { value: stats.onlineHosts, total: stats.totalHosts, color: "#22C55E" }
                : undefined
            }
          />
        </Grid>
        <Grid item xs={6} sm={4} md>
          <StatCard
            icon={<WarningAmberOutlinedIcon sx={{ fontSize: 20 }} />}
            label="Active Problems"
            value={loading ? 0 : problems.length}
            sub={problems.length === 0 && !loading ? "All clear" : undefined}
            color={problems.length > 0 ? "#EF4444" : "#22C55E"}
            loading={loading}
            href="/metrics"
          />
        </Grid>
        <Grid item xs={6} sm={4} md>
          <StatCard
            icon={<NotificationsActiveOutlinedIcon sx={{ fontSize: 20 }} />}
            label="Alert Events"
            value={loading ? 0 : alertEvents.length > 0 ? `${alertEvents.length}+` : 0}
            color={alertEvents.length > 0 ? "#F59E0B" : "#22C55E"}
            loading={loading}
            href="/metrics"
          />
        </Grid>
        <Grid item xs={6} sm={4} md>
          <StatCard
            icon={<GroupsOutlinedIcon sx={{ fontSize: 20 }} />}
            label="Teams"
            value={stats?.totalTeams ?? 0}
            color="#8B5CF6"
            loading={loading}
            href="/teams"
          />
        </Grid>
        <Grid item xs={6} sm={4} md>
          <StatCard
            icon={<PersonOutlinedIcon sx={{ fontSize: 20 }} />}
            label="Team Members"
            value={stats?.totalUsers ?? 0}
            color="#F59E0B"
            loading={loading}
            href="/teams"
          />
        </Grid>
      </Grid>

      {/* ── Main panels ── */}
      <Grid container spacing={2.5}>
        {/* Active Problems */}
        <Grid item xs={12} md={5}>
          <Card sx={{ height: "100%" }}>
            <CardContent sx={{ p: 2.5, height: "100%", display: "flex", flexDirection: "column" }}>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  mb: 0.5,
                }}
              >
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  Active Problems
                </Typography>
                {!loading && problems.length > 0 && (
                  <Chip
                    size="small"
                    label={problems.length}
                    sx={{
                      bgcolor: "rgba(239,68,68,0.12)",
                      color: "error.main",
                      fontWeight: 700,
                      height: 20,
                      fontSize: "0.7rem",
                    }}
                  />
                )}
              </Box>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mb: 2, fontSize: "0.78rem" }}
              >
                Live Zabbix trigger alerts
              </Typography>
              <Divider sx={{ mb: 1.5 }} />

              {loading ? (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                  {[1, 2, 3, 4].map((n) => (
                    <Skeleton key={n} variant="rounded" height={44} />
                  ))}
                </Box>
              ) : problems.length === 0 ? (
                <Box
                  sx={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 1,
                    py: 4,
                  }}
                >
                  <CheckCircleOutlineIcon
                    sx={{ fontSize: 40, color: "success.main", opacity: 0.7 }}
                  />
                  <Typography variant="body2" sx={{ fontWeight: 600, color: "success.main" }}>
                    No active problems
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    All monitored hosts are healthy
                  </Typography>
                </Box>
              ) : (
                <>
                  <Box sx={{ flex: 1, overflow: "auto", maxHeight: 320 }}>
                    {problems.slice(0, 8).map((p) => (
                      <ProblemRow key={p.eventid} problem={p} />
                    ))}
                  </Box>
                  {problems.length > 8 && (
                    <Box sx={{ mt: 1.5, pt: 1.5, borderTop: "1px solid", borderColor: "divider" }}>
                      <Button
                        component={Link}
                        href="/metrics"
                        size="small"
                        sx={{ fontSize: "0.75rem", p: 0 }}
                      >
                        View all {problems.length} problems →
                      </Button>
                    </Box>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Alert Events */}
        <Grid item xs={12} md={4}>
          <Card sx={{ height: "100%" }}>
            <CardContent sx={{ p: 2.5, height: "100%", display: "flex", flexDirection: "column" }}>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  mb: 0.5,
                }}
              >
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  Recent Alerts
                </Typography>
                <ErrorOutlineIcon sx={{ fontSize: 18, color: "warning.main" }} />
              </Box>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mb: 2, fontSize: "0.78rem" }}
              >
                Custom rule firings
              </Typography>
              <Divider sx={{ mb: 1.5 }} />

              {loading ? (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  {[1, 2, 3].map((n) => (
                    <Skeleton key={n} variant="rounded" height={38} />
                  ))}
                </Box>
              ) : alertEvents.length === 0 ? (
                <Box
                  sx={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 1,
                    py: 3,
                  }}
                >
                  <CheckCircleOutlineIcon
                    sx={{ fontSize: 36, color: "success.main", opacity: 0.7 }}
                  />
                  <Typography variant="body2" sx={{ fontWeight: 600, color: "success.main" }}>
                    No recent alert events
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Custom rules have not fired recently
                  </Typography>
                </Box>
              ) : (
                <Box sx={{ flex: 1 }}>
                  {alertEvents.map((e) => (
                    <AlertEventRow key={e.id} event={e} />
                  ))}
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Right column: System Status + Quick Actions */}
        <Grid item xs={12} md={3}>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5, height: "100%" }}>
            {/* System Status */}
            <Card>
              <CardContent sx={{ p: 2.5 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>
                  System Status
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mb: 2, fontSize: "0.78rem" }}
                >
                  Live infrastructure health
                </Typography>
                <Divider sx={{ mb: 2 }} />
                <Box sx={{ display: "flex", flexDirection: "column", gap: 1.75 }}>
                  <StatusRow label="Backend API" ok={health?.ok ?? false} loading={loading} />
                  <StatusRow label="Zabbix" ok={health?.zabbix ?? false} loading={loading} />
                  <StatusRow label="Database" ok={health?.ok ?? false} loading={loading} />
                </Box>
                {!loading && health && (
                  <Box
                    sx={{
                      mt: 2,
                      p: 1.25,
                      borderRadius: 1.5,
                      bgcolor: allOk ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
                      border: `1px solid ${allOk ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"}`,
                    }}
                  >
                    <Typography
                      variant="body2"
                      sx={{
                        color: allOk ? "success.light" : "error.light",
                        fontWeight: 600,
                        fontSize: "0.75rem",
                      }}
                    >
                      {allOk
                        ? "All systems operational"
                        : !health.ok
                          ? "Backend unreachable"
                          : "Zabbix disconnected"}
                    </Typography>
                  </Box>
                )}
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card sx={{ flex: 1 }}>
              <CardContent sx={{ p: 2.5 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>
                  Quick Actions
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mb: 2, fontSize: "0.78rem" }}
                >
                  Jump to common tasks
                </Typography>
                <Divider sx={{ mb: 2 }} />
                <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  <ActionButton
                    icon={<StorageOutlinedIcon sx={{ fontSize: 16 }} />}
                    label="Manage Hosts"
                    href="/hosts"
                    variant="contained"
                  />
                  <ActionButton
                    icon={<DashboardOutlinedIcon sx={{ fontSize: 16 }} />}
                    label="Dashboard"
                    href="/dashboard"
                  />
                  <ActionButton
                    icon={<TuneOutlinedIcon sx={{ fontSize: 16 }} />}
                    label="Items & Triggers"
                    href="/items"
                  />
                  <ActionButton
                    icon={<RouterOutlinedIcon sx={{ fontSize: 16 }} />}
                    label="Live Metrics"
                    href="/metrics"
                  />
                  {isAdmin && (
                    <ActionButton
                      icon={<GroupsOutlinedIcon sx={{ fontSize: 16 }} />}
                      label="Manage Teams"
                      href="/teams"
                    />
                  )}
                  <ActionButton
                    icon={<DownloadOutlinedIcon sx={{ fontSize: 16 }} />}
                    label="Export Inventory"
                    href="/api/hosts/download"
                    external
                  />
                </Box>
              </CardContent>
            </Card>
          </Box>
        </Grid>
      </Grid>
    </Box>
  );
};
