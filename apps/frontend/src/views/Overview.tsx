"use client";
import ComputerOutlinedIcon from "@mui/icons-material/ComputerOutlined";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import PersonOutlinedIcon from "@mui/icons-material/PersonOutlined";
import RouterOutlinedIcon from "@mui/icons-material/RouterOutlined";
import StorageOutlinedIcon from "@mui/icons-material/StorageOutlined";
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Grid,
  Skeleton,
  Typography,
} from "@mui/material";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "../app/context/AuthContext";
import { api, type Team } from "../app/api";

type Stats = {
  totalHosts: number;
  onlineHosts: number;
  totalTeams: number;
  totalUsers: number;
  assignedServers: number;
};

const StatCard = ({
  icon,
  label,
  value,
  sub,
  color = "primary.main",
  loading,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  sub?: string;
  color?: string;
  loading: boolean;
  href?: string;
}) => (
  <Card
    component={href ? Link : "div"}
    href={href}
    sx={{
      height: "100%",
      textDecoration: "none",
      cursor: href ? "pointer" : "default",
      transition: "transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease",
      "&:hover": href
        ? { transform: "translateY(-2px)", boxShadow: "0 12px 32px rgba(0,0,0,0.4)", borderColor: color }
        : {},
    }}
  >
    <CardContent sx={{ p: 2.5 }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1.5 }}>
        <Box
          sx={{
            width: 36,
            height: 36,
            borderRadius: 2,
            backgroundColor: `${color}1A`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color,
          }}
        >
          {icon}
        </Box>
        {sub && (
          <Typography variant="caption" sx={{ color: "text.secondary", fontSize: "0.7rem" }}>
            {sub}
          </Typography>
        )}
      </Box>
      {loading ? (
        <>
          <Skeleton variant="text" width={60} height={44} sx={{ mb: 0.5 }} />
          <Skeleton variant="text" width={80} height={18} />
        </>
      ) : (
        <>
          <Typography sx={{ fontSize: "2rem", fontWeight: 700, lineHeight: 1, letterSpacing: -1, color }}>
            {value}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, fontSize: "0.78rem" }}>
            {label}
          </Typography>
        </>
      )}
    </CardContent>
  </Card>
);

const StatusRow = ({
  label,
  ok,
  loading,
}: {
  label: string;
  ok: boolean;
  loading: boolean;
}) => (
  <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
    <Typography variant="body2" color="text.secondary" sx={{ fontSize: "0.8125rem" }}>
      {label}
    </Typography>
    {loading ? (
      <Skeleton variant="rounded" width={60} height={20} />
    ) : (
      <Chip
        size="small"
        label={ok ? "Online" : "Offline"}
        color={ok ? "success" : "error"}
        variant="outlined"
        sx={{ height: 22, fontSize: "0.7rem" }}
      />
    )}
  </Box>
);

export const Overview = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [health, setHealth] = useState<{ ok: boolean; zabbix: boolean } | null>(null);
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

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [hostsRes, teamsRes, healthRes] = await Promise.all([
          api.listHosts(),
          api.getTeamsOverview(),
          api.health(),
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
      } catch {
        /* silently handled — individual widgets show loading state */
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" sx={{ fontWeight: 700, letterSpacing: -0.5, mb: 0.5 }}>
          {greeting}{user?.username ? `, ${user.username}` : ""}
        </Typography>
        <Typography color="text.secondary" sx={{ fontSize: "0.875rem" }}>
          {dateStr}
        </Typography>
      </Box>

      {/* Stat cards */}
      <Grid container spacing={2.5} sx={{ mb: 4 }}>
        {[
          {
            icon: <StorageOutlinedIcon sx={{ fontSize: 20 }} />,
            label: "Total Hosts",
            value: stats?.totalHosts ?? 0,
            color: "#3B82F6",
            href: "/hosts",
          },
          {
            icon: <RouterOutlinedIcon sx={{ fontSize: 20 }} />,
            label: "Online Hosts",
            value: stats?.onlineHosts ?? 0,
            sub: stats ? `${stats.totalHosts - stats.onlineHosts} offline` : undefined,
            color: "#22C55E",
            href: "/hosts",
          },
          {
            icon: <GroupsOutlinedIcon sx={{ fontSize: 20 }} />,
            label: "Teams",
            value: stats?.totalTeams ?? 0,
            color: "#8B5CF6",
            href: "/teams",
          },
          {
            icon: <PersonOutlinedIcon sx={{ fontSize: 20 }} />,
            label: "Team Members",
            value: stats?.totalUsers ?? 0,
            color: "#F59E0B",
            href: "/teams",
          },
          {
            icon: <ComputerOutlinedIcon sx={{ fontSize: 20 }} />,
            label: "Assigned Servers",
            value: stats?.assignedServers ?? 0,
            sub: stats ? `${stats.totalHosts - stats.assignedServers} unassigned` : undefined,
            color: "#10B981",
            href: "/teams",
          },
        ].map((card) => (
          <Grid item xs={12} sm={6} md={4} lg key={card.label}>
            <StatCard {...card} loading={loading} />
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={3}>
        {/* Quick actions */}
        <Grid item xs={12} md={7}>
          <Card sx={{ height: "100%" }}>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>
                Quick Actions
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5, fontSize: "0.8rem" }}>
                Jump to common tasks
              </Typography>
              <Divider sx={{ mb: 2.5 }} />
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5 }}>
                <Button
                  component={Link}
                  href="/hosts"
                  variant="contained"
                  startIcon={<StorageOutlinedIcon sx={{ fontSize: 16 }} />}
                  sx={{ fontSize: "0.8rem" }}
                >
                  Manage Hosts
                </Button>
                <Button
                  href="/api/hosts/download"
                  variant="outlined"
                  startIcon={<DownloadOutlinedIcon sx={{ fontSize: 16 }} />}
                  sx={{ fontSize: "0.8rem" }}
                >
                  Export Inventory
                </Button>
                <Button
                  component={Link}
                  href="/teams"
                  variant="outlined"
                  startIcon={<GroupsOutlinedIcon sx={{ fontSize: 16 }} />}
                  sx={{ fontSize: "0.8rem" }}
                >
                  Manage Teams
                </Button>
                <Button
                  component={Link}
                  href="/items"
                  variant="outlined"
                  startIcon={<RouterOutlinedIcon sx={{ fontSize: 16 }} />}
                  sx={{ fontSize: "0.8rem" }}
                >
                  Items & Triggers
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* System Status */}
        <Grid item xs={12} md={5}>
          <Card sx={{ height: "100%" }}>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>
                System Status
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5, fontSize: "0.8rem" }}>
                Live infrastructure health
              </Typography>
              <Divider sx={{ mb: 2.5 }} />
              <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <StatusRow label="Backend API" ok={health?.ok ?? false} loading={loading} />
                <StatusRow label="Zabbix Connection" ok={health?.zabbix ?? false} loading={loading} />
                <StatusRow label="Database" ok={health?.ok ?? false} loading={loading} />
              </Box>
              {!loading && health && (
                <Box
                  sx={{
                    mt: 3,
                    p: 1.5,
                    borderRadius: 2,
                    backgroundColor: health.ok && health.zabbix
                      ? "rgba(34,197,94,0.08)"
                      : "rgba(239,68,68,0.08)",
                    border: `1px solid ${health.ok && health.zabbix ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"}`,
                  }}
                >
                  <Typography
                    variant="body2"
                    sx={{
                      color: health.ok && health.zabbix ? "success.light" : "error.light",
                      fontWeight: 600,
                      fontSize: "0.78rem",
                    }}
                  >
                    {health.ok && health.zabbix
                      ? "All systems operational"
                      : !health.ok
                      ? "Backend unreachable — API calls will fail"
                      : "Zabbix disconnected — check credentials"}
                  </Typography>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};
