"use client";
import CloseIcon from "@mui/icons-material/Close";
import ComputerOutlinedIcon from "@mui/icons-material/ComputerOutlined";
import DarkModeOutlinedIcon from "@mui/icons-material/DarkModeOutlined";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import DeleteSweepOutlinedIcon from "@mui/icons-material/DeleteSweepOutlined";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import InboxOutlinedIcon from "@mui/icons-material/InboxOutlined";
import LightModeOutlinedIcon from "@mui/icons-material/LightModeOutlined";
import LogoutIcon from "@mui/icons-material/Logout";
import MarkEmailReadOutlinedIcon from "@mui/icons-material/MarkEmailReadOutlined";
import MenuIcon from "@mui/icons-material/Menu";
import MusicNoteOutlinedIcon from "@mui/icons-material/MusicNoteOutlined";
import NotificationsActiveOutlinedIcon from "@mui/icons-material/NotificationsActiveOutlined";
import NotificationsNoneOutlinedIcon from "@mui/icons-material/NotificationsNoneOutlined";
import PeopleOutlinedIcon from "@mui/icons-material/PeopleOutlined";
import PlaylistAddOutlinedIcon from "@mui/icons-material/PlaylistAddOutlined";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import ShowChartOutlinedIcon from "@mui/icons-material/ShowChartOutlined";
import SpaceDashboardOutlinedIcon from "@mui/icons-material/SpaceDashboardOutlined";
import VolumeMuteOutlinedIcon from "@mui/icons-material/VolumeMuteOutlined";
import VolumeUpOutlinedIcon from "@mui/icons-material/VolumeUpOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import {
  Badge,
  Box,
  Chip,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  Skeleton,
  Tab,
  Tabs,
  Tooltip,
  Typography,
} from "@mui/material";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PropsWithChildren, ReactNode } from "react";
import { type AlertEvent, type Problem, type StoredNotif, api } from "../api";
import { useAuth } from "../context/AuthContext";
import { useThemeMode } from "../context/ThemeContext";

const drawerWidth = 232;

type NavItem = { href: string; label: string; icon: ReactNode; adminOnly?: boolean };

const navItems: NavItem[] = [
  { href: "/", label: "Overview", icon: <DashboardOutlinedIcon sx={{ fontSize: 18 }} /> },
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: <SpaceDashboardOutlinedIcon sx={{ fontSize: 18 }} />,
  },
  { href: "/hosts", label: "Hosts", icon: <ComputerOutlinedIcon sx={{ fontSize: 18 }} /> },
  { href: "/items", label: "Items", icon: <PlaylistAddOutlinedIcon sx={{ fontSize: 18 }} /> },
  { href: "/teams", label: "Teams", icon: <GroupsOutlinedIcon sx={{ fontSize: 18 }} /> },
  { href: "/metrics", label: "Metrics", icon: <ShowChartOutlinedIcon sx={{ fontSize: 18 }} /> },
  {
    href: "/users",
    label: "Users",
    icon: <PeopleOutlinedIcon sx={{ fontSize: 18 }} />,
    adminOnly: true,
  },
];

// Severity config for notifications
const SEV: Record<
  number,
  { label: string; color: string; bg: string; beeps: number; freq: number }
> = {
  5: { label: "Critical", color: "#B71C1C", bg: "rgba(183,28,28,0.15)", beeps: 3, freq: 880 },
  4: { label: "High", color: "#F44336", bg: "rgba(244,67,54,0.13)", beeps: 2, freq: 740 },
  3: { label: "Medium", color: "#FF5722", bg: "rgba(255,87,34,0.12)", beeps: 2, freq: 587 },
  2: { label: "Low", color: "#FFC107", bg: "rgba(255,193,7,0.11)", beeps: 1, freq: 440 },
  1: { label: "Info", color: "#2196F3", bg: "rgba(33,150,243,0.1)", beeps: 1, freq: 330 },
  0: { label: "None", color: "#9E9E9E", bg: "rgba(158,158,158,0.1)", beeps: 1, freq: 330 },
};

const getSev = (n: number) => SEV[n] ?? SEV[0];

// ── Alert sounds ────────────────────────────────────────────────────────────
// All sounds are synthesized with the Web Audio API — no audio files, so this
// works fully offline / air-gapped. Each preset schedules one or more tones.

const tone = (
  ctx: AudioContext,
  {
    freq,
    start,
    dur,
    type = "sine",
    peak = 0.35,
  }: {
    freq: number;
    start: number;
    dur: number;
    type?: OscillatorType;
    peak?: number;
  },
) => {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = type;
  osc.frequency.value = freq;
  const t0 = ctx.currentTime + start;
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(peak, t0 + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.start(t0);
  osc.stop(t0 + dur);
};

type SoundPreset = { label: string; play: (ctx: AudioContext, severity: number) => void };

const SOUND_PRESETS: Record<string, SoundPreset> = {
  beep: {
    label: "Beep",
    play: (ctx, severity) => {
      const { beeps, freq } = getSev(severity);
      for (let i = 0; i < beeps; i++) tone(ctx, { freq, start: i * 0.28, dur: 0.22 });
    },
  },
  chime: {
    label: "Chime",
    play: (ctx, severity) => {
      const notes = severity >= 4 ? [523, 659, 784, 1047] : [523, 659, 784];
      notes.forEach((freq, i) =>
        tone(ctx, { freq, start: i * 0.13, dur: 0.35, type: "triangle", peak: 0.3 }),
      );
    },
  },
  ping: {
    label: "Ping",
    play: (ctx, severity) =>
      tone(ctx, {
        freq: severity >= 4 ? 1175 : 880,
        start: 0,
        dur: 0.5,
        type: "triangle",
        peak: 0.32,
      }),
  },
  alarm: {
    label: "Alarm",
    play: (ctx, severity) => {
      const pulses = Math.min(5, 2 + severity); // more urgent for higher severity
      for (let i = 0; i < pulses; i++)
        tone(ctx, {
          freq: i % 2 ? 660 : 880,
          start: i * 0.16,
          dur: 0.13,
          type: "square",
          peak: 0.28,
        });
    },
  },
};

const DEFAULT_SOUND_PRESET = "beep";

const playAlertSound = (severity: number, presetKey: string = DEFAULT_SOUND_PRESET) => {
  try {
    const AudioCtx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    (SOUND_PRESETS[presetKey] ?? SOUND_PRESETS[DEFAULT_SOUND_PRESET]).play(ctx, severity);
  } catch {
    // audio not available
  }
};

const formatAge = (clock: number) => {
  const s = Math.floor(Date.now() / 1000) - clock;
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
};

// ── Notification card ─────────────────────────────────────────────────────────

const NotifCard = ({
  problem,
  onDismiss,
}: {
  problem: Problem;
  onDismiss: () => void;
}) => {
  const sev = getSev(problem.severity);
  return (
    <Paper
      elevation={8}
      sx={{
        width: 320,
        borderRadius: 2,
        overflow: "hidden",
        border: `1px solid ${sev.color}`,
        bgcolor: "background.paper",
        boxShadow: `0 8px 28px rgba(0,0,0,0.35), 0 0 0 1px ${sev.color}55`,
        display: "flex",
        flexDirection: "column",
        animation: "slideIn 0.25s ease",
        "@keyframes slideIn": {
          from: { opacity: 0, transform: "translateX(40px)" },
          to: { opacity: 1, transform: "translateX(0)" },
        },
      }}
    >
      {/* Header — solid severity color so it reads clearly in any theme */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          px: 1.5,
          py: 0.75,
          bgcolor: sev.color,
        }}
      >
        <Box
          sx={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            bgcolor: "#fff",
            flexShrink: 0,
            animation: "pulse 1.2s ease-in-out infinite",
            "@keyframes pulse": {
              "0%": { opacity: 1, transform: "scale(1)" },
              "50%": { opacity: 0.5, transform: "scale(1.4)" },
              "100%": { opacity: 1, transform: "scale(1)" },
            },
          }}
        />
        <Typography
          sx={{
            flex: 1,
            fontSize: "0.74rem",
            fontWeight: 800,
            color: "#fff",
            letterSpacing: "0.04em",
          }}
        >
          {sev.label}
        </Typography>
        <Typography sx={{ fontSize: "0.65rem", color: "rgba(255,255,255,0.85)" }}>
          {formatAge(problem.clock)}
        </Typography>
        <IconButton
          size="small"
          aria-label="Dismiss notification"
          onClick={onDismiss}
          sx={{
            p: 0.25,
            color: "rgba(255,255,255,0.85)",
            "&:hover": { color: "#fff", bgcolor: "rgba(255,255,255,0.15)" },
          }}
        >
          <CloseIcon sx={{ fontSize: 14 }} />
        </IconButton>
      </Box>

      {/* Body */}
      <Box sx={{ px: 1.5, py: 1 }}>
        <Typography sx={{ fontSize: "0.8rem", fontWeight: 600 }} noWrap>
          {problem.hostname}
        </Typography>
        <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", mt: 0.25 }}>
          {problem.name}
        </Typography>
      </Box>
    </Paper>
  );
};

// ── Status dot ────────────────────────────────────────────────────────────────

const StatusDot = ({ ok, label }: { ok: boolean | null; label: string }) => (
  <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
    <Box
      sx={{
        width: 6,
        height: 6,
        borderRadius: "50%",
        backgroundColor: ok === null ? "#64748B" : ok ? "#22C55E" : "#EF4444",
        boxShadow: ok ? "0 0 6px rgba(34,197,94,0.7)" : "none",
        flexShrink: 0,
      }}
    />
    <Typography variant="caption" sx={{ color: "text.secondary", fontSize: "0.7rem" }}>
      {label}
    </Typography>
  </Box>
);

// ── Notification center ───────────────────────────────────────────────────────

const formatEventTime = (ts: number) =>
  new Date(ts * 1000).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

const NotificationCenter = ({
  open,
  onClose,
  history,
  problems,
  lastReadClock,
  clearedBefore,
  onMarkAllRead,
  onClearHistory,
  onRefresh,
  onAcknowledge,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  history: StoredNotif[];
  problems: Problem[];
  lastReadClock: number;
  clearedBefore: number;
  onMarkAllRead: () => void;
  onClearHistory: () => void;
  onRefresh: () => void;
  onAcknowledge: (id: string) => Promise<void>;
  loading: boolean;
}) => {
  const [tab, setTab] = useState(0);
  const [ackingId, setAckingId] = useState<string | null>(null);

  const visibleHistory = history.filter((n) => n.clock > clearedBefore);
  const unreadEvents = visibleHistory.filter((n) => n.clock > lastReadClock);

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: { width: 400, display: "flex", flexDirection: "column" },
      }}
    >
      {/* Header */}
      <Box
        sx={{
          px: 2,
          pt: 2,
          pb: 1.5,
          display: "flex",
          alignItems: "center",
          gap: 1,
          borderBottom: "1px solid",
          borderColor: "divider",
          flexShrink: 0,
        }}
      >
        <InboxOutlinedIcon sx={{ fontSize: 20, color: "primary.main" }} />
        <Typography sx={{ fontWeight: 700, fontSize: "0.9rem", flex: 1 }}>
          Notification Center
        </Typography>
        {unreadEvents.length > 0 && (
          <Chip
            label={`${unreadEvents.length} new`}
            size="small"
            color="error"
            sx={{ height: 20, fontSize: "0.65rem", fontWeight: 700 }}
          />
        )}
        <Tooltip title="Refresh">
          <IconButton size="small" onClick={onRefresh} disabled={loading}>
            <RefreshOutlinedIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title="Mark all as read">
          <IconButton size="small" onClick={onMarkAllRead} disabled={unreadEvents.length === 0}>
            <MarkEmailReadOutlinedIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title="Clear alert history">
          <IconButton size="small" onClick={onClearHistory} disabled={visibleHistory.length === 0}>
            <DeleteSweepOutlinedIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
        <IconButton size="small" onClick={onClose} sx={{ ml: 0.5 }}>
          <CloseIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Box>

      {/* Tabs */}
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        sx={{ borderBottom: "1px solid", borderColor: "divider", flexShrink: 0, minHeight: 38 }}
        TabIndicatorProps={{ style: { height: 2 } }}
      >
        <Tab
          label={
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
              Alert History
              {visibleHistory.length > 0 && (
                <Chip
                  label={visibleHistory.length}
                  size="small"
                  sx={{ height: 16, fontSize: "0.6rem" }}
                />
              )}
            </Box>
          }
          sx={{ fontSize: "0.75rem", textTransform: "none", minHeight: 38, px: 2 }}
        />
        <Tab
          label={
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
              Active Problems
              {problems.length > 0 && (
                <Chip
                  label={problems.length}
                  size="small"
                  color="error"
                  sx={{ height: 16, fontSize: "0.6rem" }}
                />
              )}
            </Box>
          }
          sx={{ fontSize: "0.75rem", textTransform: "none", minHeight: 38, px: 2 }}
        />
      </Tabs>

      {/* Content */}
      <Box sx={{ flex: 1, overflowY: "auto" }}>
        {/* ── Alert History tab ── */}
        {tab === 0 && (
          <>
            {loading ? (
              <Box sx={{ p: 2, display: "flex", flexDirection: "column", gap: 1 }}>
                {[...Array(4)].map((_, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: skeleton
                  <Skeleton key={i} variant="rectangular" height={64} sx={{ borderRadius: 1 }} />
                ))}
              </Box>
            ) : visibleHistory.length === 0 ? (
              <Box sx={{ py: 10, textAlign: "center" }}>
                <InboxOutlinedIcon sx={{ fontSize: 40, color: "text.disabled", mb: 1 }} />
                <Typography variant="body2" color="text.secondary">
                  No notifications yet
                </Typography>
              </Box>
            ) : (
              <List disablePadding>
                {visibleHistory.map((n, idx) => {
                  const sev = getSev(n.severity);
                  const isNew = n.clock > lastReadClock;
                  const isAcking = ackingId === n.id;
                  return (
                    <Box key={n.id}>
                      {idx > 0 && <Divider />}
                      <Box
                        sx={{
                          display: "flex",
                          gap: 1.5,
                          px: 2,
                          py: 1.25,
                          borderLeft: `3px solid ${sev.color}`,
                          bgcolor: isNew ? `${sev.color}08` : "transparent",
                          transition: "background 0.2s",
                        }}
                      >
                        <Box
                          sx={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            bgcolor: sev.color,
                            mt: 0.6,
                            flexShrink: 0,
                          }}
                        />
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Box
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              gap: 0.75,
                              mb: 0.25,
                              flexWrap: "wrap",
                            }}
                          >
                            <Chip
                              label={sev.label}
                              size="small"
                              sx={{
                                height: 17,
                                fontSize: "0.6rem",
                                fontWeight: 700,
                                color: sev.color,
                                bgcolor: `${sev.color}18`,
                                border: `1px solid ${sev.color}40`,
                              }}
                            />
                            <Chip
                              label={n.source === "zabbix" ? "Zabbix" : "Rule"}
                              size="small"
                              variant="outlined"
                              sx={{ height: 15, fontSize: "0.55rem" }}
                            />
                            {isNew && (
                              <Chip
                                label="NEW"
                                size="small"
                                color="error"
                                sx={{ height: 15, fontSize: "0.55rem", fontWeight: 800 }}
                              />
                            )}
                            {n.acknowledged && (
                              <Chip
                                label="Ack"
                                size="small"
                                color="success"
                                variant="outlined"
                                sx={{ height: 15, fontSize: "0.55rem" }}
                              />
                            )}
                            <Typography
                              variant="caption"
                              sx={{
                                ml: "auto",
                                color: "text.disabled",
                                fontSize: "0.65rem",
                                flexShrink: 0,
                              }}
                            >
                              {formatEventTime(n.clock)}
                            </Typography>
                          </Box>
                          <Typography sx={{ fontSize: "0.78rem", fontWeight: 600 }} noWrap>
                            {n.hostname}
                          </Typography>
                          <Typography sx={{ fontSize: "0.72rem", color: "text.secondary" }} noWrap>
                            {n.name}
                          </Typography>
                          {/* Acknowledge button — only for Zabbix problems not yet acked */}
                          {n.source === "zabbix" && !n.acknowledged && (
                            <Box
                              component="button"
                              disabled={isAcking}
                              onClick={async () => {
                                setAckingId(n.id);
                                await onAcknowledge(n.id);
                                setAckingId(null);
                              }}
                              sx={{
                                mt: 0.5,
                                px: 1,
                                py: 0.25,
                                fontSize: "0.65rem",
                                fontWeight: 600,
                                borderRadius: 1,
                                border: "1px solid",
                                borderColor: "success.main",
                                color: "success.main",
                                bgcolor: "transparent",
                                cursor: isAcking ? "default" : "pointer",
                                opacity: isAcking ? 0.5 : 1,
                                "&:hover": { bgcolor: "rgba(34,197,94,0.08)" },
                              }}
                            >
                              {isAcking ? "Acknowledging…" : "Acknowledge"}
                            </Box>
                          )}
                        </Box>
                      </Box>
                    </Box>
                  );
                })}
              </List>
            )}
          </>
        )}

        {/* ── Active Problems tab ── */}
        {tab === 1 && (
          <>
            {loading ? (
              <Box sx={{ p: 2, display: "flex", flexDirection: "column", gap: 1 }}>
                {[...Array(3)].map((_, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: skeleton
                  <Skeleton key={i} variant="rectangular" height={64} sx={{ borderRadius: 1 }} />
                ))}
              </Box>
            ) : problems.length === 0 ? (
              <Box sx={{ py: 10, textAlign: "center" }}>
                <WarningAmberOutlinedIcon sx={{ fontSize: 40, color: "text.disabled", mb: 1 }} />
                <Typography variant="body2" color="text.secondary">
                  No active Zabbix problems
                </Typography>
              </Box>
            ) : (
              <List disablePadding>
                {problems.map((p, idx) => {
                  const sev = getSev(p.severity);
                  return (
                    <Box key={p.eventid}>
                      {idx > 0 && <Divider />}
                      <Box
                        sx={{
                          display: "flex",
                          gap: 1.5,
                          px: 2,
                          py: 1.25,
                          borderLeft: `3px solid ${sev.color}`,
                        }}
                      >
                        <Box
                          sx={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            bgcolor: sev.color,
                            mt: 0.6,
                            flexShrink: 0,
                          }}
                        />
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 0.25 }}>
                            <Chip
                              label={sev.label}
                              size="small"
                              sx={{
                                height: 17,
                                fontSize: "0.6rem",
                                fontWeight: 700,
                                color: sev.color,
                                bgcolor: `${sev.color}18`,
                                border: `1px solid ${sev.color}40`,
                              }}
                            />
                            <Chip
                              label={p.acknowledged ? "Ack" : "Unack"}
                              size="small"
                              color={p.acknowledged ? "success" : "default"}
                              variant="outlined"
                              sx={{ height: 15, fontSize: "0.55rem" }}
                            />
                            <Typography
                              variant="caption"
                              sx={{
                                ml: "auto",
                                color: "text.disabled",
                                fontSize: "0.65rem",
                                flexShrink: 0,
                              }}
                            >
                              {formatEventTime(p.clock)}
                            </Typography>
                          </Box>
                          <Typography sx={{ fontSize: "0.78rem", fontWeight: 600 }} noWrap>
                            {p.hostname}
                          </Typography>
                          <Typography sx={{ fontSize: "0.72rem", color: "text.secondary" }} noWrap>
                            {p.name}
                          </Typography>
                          {!p.acknowledged && (
                            <Box
                              component="button"
                              disabled={ackingId === p.eventid}
                              onClick={async () => {
                                setAckingId(p.eventid);
                                await onAcknowledge(p.eventid);
                                setAckingId(null);
                              }}
                              sx={{
                                mt: 0.5,
                                px: 1,
                                py: 0.25,
                                fontSize: "0.65rem",
                                fontWeight: 600,
                                borderRadius: 1,
                                border: "1px solid",
                                borderColor: "success.main",
                                color: "success.main",
                                bgcolor: "transparent",
                                cursor: ackingId === p.eventid ? "default" : "pointer",
                                opacity: ackingId === p.eventid ? 0.5 : 1,
                                "&:hover": { bgcolor: "rgba(34,197,94,0.08)" },
                              }}
                            >
                              {ackingId === p.eventid ? "Acknowledging…" : "Acknowledge"}
                            </Box>
                          )}
                        </Box>
                      </Box>
                    </Box>
                  );
                })}
              </List>
            )}
          </>
        )}
      </Box>

      {/* Footer */}
      <Box
        sx={{
          px: 2,
          py: 1,
          borderTop: "1px solid",
          borderColor: "divider",
          flexShrink: 0,
        }}
      >
        <Typography variant="caption" color="text.disabled" sx={{ fontSize: "0.65rem" }}>
          {tab === 0
            ? `${visibleHistory.length} notification${visibleHistory.length !== 1 ? "s" : ""} · Zabbix problems + alert rules`
            : `${problems.length} active problem${problems.length !== 1 ? "s" : ""} · from Zabbix triggers`}
        </Typography>
      </Box>
    </Drawer>
  );
};

// ── AppShell ──────────────────────────────────────────────────────────────────

export const AppShell = ({ children }: PropsWithChildren) => {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { mode, toggle: toggleMode } = useThemeMode();
  const isDark = mode === "dark";
  const [mobileOpen, setMobileOpen] = useState(false);
  const [health, setHealth] = useState<{ ok: boolean; zabbix: boolean } | null>(null);

  // ── Alert state ──────────────────────────────────────────────────────────
  const [activeProblems, setActiveProblems] = useState<Problem[]>([]);
  const [notifications, setNotifications] = useState<Problem[]>([]);

  // ── Notification center ──────────────────────────────────────────────────

  // Helpers to read/write the persistent notification history in localStorage.
  // This stores ALL popups (Zabbix problems + custom rule events) so they
  // survive being dismissed and page reloads. Max 200 entries, newest first.
  const loadStoredHistory = (): StoredNotif[] => {
    try {
      return JSON.parse(localStorage.getItem("notifHistory") ?? "[]");
    } catch {
      return [];
    }
  };

  const saveToHistory = (entries: StoredNotif[]) => {
    const current = loadStoredHistory();
    const existingIds = new Set(current.map((n) => n.id));
    const fresh = entries.filter((e) => !existingIds.has(e.id));
    if (fresh.length === 0) return;
    const merged = [...fresh, ...current].slice(0, 200);
    localStorage.setItem("notifHistory", JSON.stringify(merged));
    setStoredHistory(merged);
  };

  const [notifCenterOpen, setNotifCenterOpen] = useState(false);
  const [storedHistory, setStoredHistory] = useState<StoredNotif[]>(() => loadStoredHistory());
  const [centerLoading, setCenterLoading] = useState(false);
  const [lastReadClock, setLastReadClock] = useState(() => {
    if (typeof window === "undefined") return 0;
    return parseInt(localStorage.getItem("notifLastReadClock") ?? "0");
  });
  const [clearedBefore, setClearedBefore] = useState(() => {
    if (typeof window === "undefined") return 0;
    return parseInt(localStorage.getItem("notifClearedBefore") ?? "0");
  });

  // Unread = any stored notification newer than the last time the center was opened
  const unreadCenterCount = storedHistory.filter(
    (n) => n.clock > lastReadClock && n.clock > clearedBefore,
  ).length;

  const openNotifCenter = () => {
    setNotifCenterOpen(true);
    setCenterLoading(true);
    const now = Math.floor(Date.now() / 1000);
    setLastReadClock(now);
    localStorage.setItem("notifLastReadClock", String(now));
    Promise.all([api.getAlertEvents(500), api.getProblems()])
      .then(([_evRes, prRes]) => {
        setActiveProblems(prRes.problems);
      })
      .catch(() => {})
      .finally(() => setCenterLoading(false));
  };

  const markAllRead = () => {
    const now = Math.floor(Date.now() / 1000);
    setLastReadClock(now);
    localStorage.setItem("notifLastReadClock", String(now));
  };

  const clearHistory = () => {
    const now = Math.floor(Date.now() / 1000);
    setClearedBefore(now);
    localStorage.setItem("notifClearedBefore", String(now));
  };

  const refreshCenter = () => {
    setCenterLoading(true);
    setStoredHistory(loadStoredHistory());
    api
      .getProblems()
      .then((prRes) => setActiveProblems(prRes.problems))
      .catch(() => {})
      .finally(() => setCenterLoading(false));
  };

  const acknowledgeInHistory = (id: string) => {
    setStoredHistory((prev) => {
      const updated = prev.map((n) => (n.id === id ? { ...n, acknowledged: true } : n));
      localStorage.setItem("notifHistory", JSON.stringify(updated));
      return updated;
    });
  };
  const [soundEnabled, setSoundEnabled] = useState(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("alertSound") !== "false";
  });
  const [soundPreset, setSoundPreset] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_SOUND_PRESET;
    return localStorage.getItem("alertSoundPreset") ?? DEFAULT_SOUND_PRESET;
  });
  const [soundMenuAnchor, setSoundMenuAnchor] = useState<null | HTMLElement>(null);

  const seenIds = useRef<Set<string>>(new Set());
  const seenEventIds = useRef<Set<number>>(new Set());
  const firstPoll = useRef(true);
  const firstEventPoll = useRef(true);
  const soundRef = useRef(soundEnabled);
  soundRef.current = soundEnabled;
  const soundPresetRef = useRef(soundPreset);
  soundPresetRef.current = soundPreset;

  const selectSoundPreset = (key: string) => {
    localStorage.setItem("alertSoundPreset", key);
    setSoundPreset(key);
    setSoundMenuAnchor(null);
    playAlertSound(3, key); // preview the chosen sound
  };

  const dismissNotif = useCallback((eventid: string) => {
    setNotifications((prev) => prev.filter((p) => p.eventid !== eventid));
  }, []);

  const toggleSound = () => {
    setSoundEnabled((v) => {
      localStorage.setItem("alertSound", String(!v));
      return !v;
    });
  };

  // ── Health poll ──────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const h = await api.health();
        if (!cancelled) setHealth({ ok: h.status === "online", zabbix: !!h.zabbix_connected });
      } catch {
        if (!cancelled) setHealth({ ok: false, zabbix: false });
      }
    };
    void load();
    const t = window.setInterval(load, 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, []);

  // ── Problem poll ─────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await api.getProblems();
        if (cancelled) return;
        const problems = res.problems;
        setActiveProblems(problems);

        const currentIds = new Set(problems.map((p) => p.eventid));

        if (firstPoll.current) {
          // Seed known IDs on load — don't alert for pre-existing problems
          for (const id of currentIds) seenIds.current.add(id);
          firstPoll.current = false;
          return;
        }

        // Remove resolved problems from seen set so re-fires are caught
        for (const id of seenIds.current) {
          if (!currentIds.has(id)) seenIds.current.delete(id);
        }

        const newProblems = problems.filter((p) => !seenIds.current.has(p.eventid));
        for (const p of newProblems) seenIds.current.add(p.eventid);

        if (newProblems.length > 0) {
          setNotifications((prev) => [...newProblems, ...prev].slice(0, 8));
          // Persist to history so they survive dismissal and page reload
          saveToHistory(
            newProblems.map((p) => ({
              id: p.eventid,
              source: "zabbix" as const,
              hostname: p.hostname,
              severity: p.severity,
              name: p.name,
              clock: p.clock,
              acknowledged: p.acknowledged,
            })),
          );
          if (soundRef.current) {
            const maxSev = Math.max(...newProblems.map((p) => p.severity));
            playAlertSound(maxSev, soundPresetRef.current);
          }
        }
      } catch {
        // silently fail
      }
    };

    void poll();
    const t = window.setInterval(poll, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, []);

  // ── Custom alert events poll ─────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await api.getAlertEvents();
        if (cancelled) return;

        if (firstEventPoll.current) {
          for (const e of res.events) seenEventIds.current.add(e.id);
          firstEventPoll.current = false;
          return;
        }

        const newEvents = res.events.filter((e) => !seenEventIds.current.has(e.id));
        for (const e of newEvents) seenEventIds.current.add(e.id);

        if (newEvents.length > 0) {
          const asProblems: Problem[] = newEvents.map((e: AlertEvent) => ({
            eventid: `rule-${e.id}`,
            hostname: e.hostname,
            severity: e.severity,
            severity_name: "",
            name: `${e.item_name} ${e.operator} ${e.threshold} (actual: ${e.actual_value})`,
            clock: e.fired_at,
            age_seconds: Math.floor(Date.now() / 1000) - e.fired_at,
            acknowledged: false,
          }));
          setNotifications((prev) => [...asProblems, ...prev].slice(0, 8));
          // Persist to history and prepend into the notification center log
          saveToHistory(
            newEvents.map((e) => ({
              id: `rule-${e.id}`,
              source: "rule" as const,
              hostname: e.hostname,
              severity: e.severity,
              name: `${e.item_name} ${e.operator} ${e.threshold} (actual: ${e.actual_value})`,
              clock: e.fired_at,
              acknowledged: false,
            })),
          );
          if (soundRef.current) {
            const maxSev = Math.max(...newEvents.map((e: AlertEvent) => e.severity));
            playAlertSound(maxSev, soundPresetRef.current);
          }
        }
      } catch {
        // silently fail
      }
    };
    void poll();
    // Poll custom alert events frequently so a fired rule surfaces ASAP.
    const t = window.setInterval(poll, 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, []);

  // Auto-dismiss low-severity notifications after 8 s
  useEffect(() => {
    if (notifications.length === 0) return;
    const timer = setTimeout(() => {
      setNotifications((prev) => prev.filter((p) => p.severity >= 3));
    }, 8_000);
    return () => clearTimeout(timer);
  }, [notifications]);

  const pageTitle = useMemo(
    () => navItems.find((n) => n.href === pathname)?.label ?? "Zabbix DevOps",
    [pathname],
  );

  const initials = user?.username.slice(0, 2).toUpperCase() ?? "??";
  const problemCount = activeProblems.length;

  const drawer = (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Brand */}
      <Box sx={{ px: 2, pt: 2, pb: 1.75 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
          <Box
            sx={{
              width: 34,
              height: 34,
              borderRadius: 2,
              background: "linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              boxShadow: "0 4px 12px rgba(59,130,246,0.4)",
            }}
          >
            <ComputerOutlinedIcon sx={{ fontSize: 18, color: "#fff" }} />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              sx={{ fontWeight: 700, fontSize: "0.875rem", lineHeight: 1.2, letterSpacing: 0.1 }}
            >
              Zabbix DevOps
            </Typography>
            <Typography sx={{ fontSize: "0.65rem", color: "text.secondary", lineHeight: 1.3 }}>
              Control Plane
            </Typography>
          </Box>
          <Tooltip title={isDark ? "Switch to light mode" : "Switch to dark mode"}>
            <IconButton
              size="small"
              onClick={toggleMode}
              sx={{
                color: "text.secondary",
                flexShrink: 0,
                "&:hover": { color: "primary.main", backgroundColor: "rgba(59,130,246,0.1)" },
                transition: "all 0.2s ease",
              }}
            >
              {isDark ? (
                <LightModeOutlinedIcon sx={{ fontSize: 17 }} />
              ) : (
                <DarkModeOutlinedIcon sx={{ fontSize: 17 }} />
              )}
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      <Divider />

      {/* Nav */}
      <List sx={{ px: 1.25, pt: 1.5, flex: 1 }} disablePadding>
        {navItems
          .filter((item) => {
            if (!item.adminOnly) return true;
            const roles = user?.roles ?? [];
            return roles.includes("root") || roles.includes("team_lead");
          })
          .map((item) => {
            const selected = pathname === item.href;
            const isMetrics = item.href === "/metrics";
            return (
              <ListItemButton
                key={item.href}
                component={Link}
                href={item.href}
                sx={{
                  borderRadius: "8px",
                  mb: 0.5,
                  px: 1.25,
                  py: 0.875,
                  borderLeft: `3px solid ${selected ? "#3B82F6" : "transparent"}`,
                  backgroundColor: selected ? "rgba(59,130,246,0.1)" : "transparent",
                  "&:hover": {
                    backgroundColor: selected ? "rgba(59,130,246,0.13)" : "rgba(255,255,255,0.04)",
                  },
                  transition: "all 0.15s ease",
                }}
              >
                <ListItemIcon
                  sx={{
                    minWidth: 34,
                    color: selected ? "primary.main" : "text.secondary",
                    transition: "color 0.15s ease",
                  }}
                >
                  {isMetrics && problemCount > 0 ? (
                    <Badge
                      badgeContent={problemCount > 99 ? "99+" : problemCount}
                      color="error"
                      sx={{
                        "& .MuiBadge-badge": {
                          fontSize: "0.55rem",
                          height: 14,
                          minWidth: 14,
                          p: "0 3px",
                        },
                      }}
                    >
                      {item.icon}
                    </Badge>
                  ) : (
                    item.icon
                  )}
                </ListItemIcon>
                <ListItemText
                  primary={item.label}
                  primaryTypographyProps={{
                    fontSize: "0.8125rem",
                    fontWeight: selected ? 600 : 400,
                    color: selected ? "text.primary" : "text.secondary",
                  }}
                />
              </ListItemButton>
            );
          })}
      </List>

      {/* Notification center button */}
      <Box sx={{ mx: 1.25, mb: 0.75 }}>
        <Tooltip title="Notification Center" placement="right">
          <Box
            onClick={openNotifCenter}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              px: 1.5,
              py: 0.875,
              borderRadius: "8px",
              cursor: "pointer",
              transition: "background 0.15s",
              "&:hover": { bgcolor: "rgba(255,255,255,0.04)" },
            }}
          >
            <Badge
              badgeContent={unreadCenterCount || null}
              color="error"
              sx={{
                "& .MuiBadge-badge": { fontSize: "0.55rem", height: 14, minWidth: 14, p: "0 3px" },
              }}
            >
              <InboxOutlinedIcon
                sx={{
                  fontSize: 18,
                  color: unreadCenterCount > 0 ? "primary.main" : "text.secondary",
                }}
              />
            </Badge>
            <Typography
              sx={{
                fontSize: "0.8125rem",
                color: "text.secondary",
                fontWeight: unreadCenterCount > 0 ? 600 : 400,
              }}
            >
              Notification Center
            </Typography>
            {unreadCenterCount > 0 && (
              <Chip
                label={`${unreadCenterCount} new`}
                size="small"
                color="error"
                sx={{ height: 16, fontSize: "0.58rem", ml: "auto" }}
              />
            )}
          </Box>
        </Tooltip>
      </Box>

      {/* Alert controls */}
      <Box
        sx={{
          mx: 1.25,
          mb: 1,
          px: 1.5,
          py: 1,
          borderRadius: 2,
          border: "1px solid",
          borderColor: problemCount > 0 ? "rgba(239,68,68,0.35)" : "divider",
          bgcolor: problemCount > 0 ? "rgba(239,68,68,0.06)" : "transparent",
          display: "flex",
          alignItems: "center",
          gap: 1,
          transition: "all 0.3s",
          cursor: problemCount > 0 ? "pointer" : "default",
        }}
        onClick={() => problemCount > 0 && router.push("/metrics")}
      >
        <Badge
          badgeContent={problemCount || null}
          color="error"
          sx={{ "& .MuiBadge-badge": { fontSize: "0.6rem", height: 16, minWidth: 16 } }}
        >
          {problemCount > 0 ? (
            <NotificationsActiveOutlinedIcon sx={{ fontSize: 17, color: "#EF4444" }} />
          ) : (
            <NotificationsNoneOutlinedIcon sx={{ fontSize: 17, color: "text.disabled" }} />
          )}
        </Badge>
        <Typography
          sx={{
            flex: 1,
            fontSize: "0.72rem",
            color: problemCount > 0 ? "#EF4444" : "text.disabled",
          }}
        >
          {problemCount > 0
            ? `${problemCount} active problem${problemCount !== 1 ? "s" : ""}`
            : "No problems"}
        </Typography>
        <Tooltip title="Notification sound">
          <span>
            <IconButton
              size="small"
              disabled={!soundEnabled}
              onClick={(e) => {
                e.stopPropagation();
                setSoundMenuAnchor(e.currentTarget);
              }}
              sx={{ p: 0.25, color: "text.secondary", "&:hover": { color: "text.primary" } }}
            >
              <MusicNoteOutlinedIcon sx={{ fontSize: 15 }} />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title={soundEnabled ? "Mute alerts" : "Unmute alerts"}>
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              toggleSound();
            }}
            sx={{
              p: 0.25,
              color: soundEnabled ? "text.secondary" : "text.disabled",
              "&:hover": { color: "text.primary" },
            }}
          >
            {soundEnabled ? (
              <VolumeUpOutlinedIcon sx={{ fontSize: 15 }} />
            ) : (
              <VolumeMuteOutlinedIcon sx={{ fontSize: 15 }} />
            )}
          </IconButton>
        </Tooltip>
        <Menu
          anchorEl={soundMenuAnchor}
          open={Boolean(soundMenuAnchor)}
          onClose={() => setSoundMenuAnchor(null)}
          onClick={(e) => e.stopPropagation()}
        >
          {Object.entries(SOUND_PRESETS).map(([key, preset]) => (
            <MenuItem
              key={key}
              selected={key === soundPreset}
              onClick={() => selectSoundPreset(key)}
              sx={{ fontSize: "0.8rem", gap: 1 }}
            >
              {preset.label}
            </MenuItem>
          ))}
        </Menu>
      </Box>

      {/* Health status */}
      <Box sx={{ px: 2.5, py: 1.5, display: "flex", flexDirection: "column", gap: 0.75 }}>
        <StatusDot ok={health?.ok ?? null} label="Backend API" />
        <StatusDot ok={health?.zabbix ?? null} label="Zabbix" />
      </Box>

      <Divider />

      {/* User */}
      {user && (
        <Box sx={{ px: 2, py: 1.5, display: "flex", alignItems: "center", gap: 1.25 }}>
          <Box
            sx={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #3B82F6, #8B5CF6)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Typography
              sx={{ fontSize: "0.65rem", fontWeight: 700, color: "#fff", letterSpacing: 0.5 }}
            >
              {initials}
            </Typography>
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: "0.8rem", fontWeight: 600, lineHeight: 1.2 }} noWrap>
              {user.username}
            </Typography>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mt: 0.25 }}>
              {(user.roles ?? []).map((r) => (
                <Chip
                  key={r}
                  label={r === "team_lead" ? "Team Lead" : r.charAt(0).toUpperCase() + r.slice(1)}
                  size="small"
                  color={
                    r === "root"
                      ? "error"
                      : r === "team_lead"
                        ? "primary"
                        : r === "operator"
                          ? "secondary"
                          : r === "auditor"
                            ? "warning"
                            : "default"
                  }
                  sx={{ height: 16, fontSize: "0.58rem" }}
                />
              ))}
            </Box>
          </Box>
          <Tooltip title="Sign out">
            <IconButton
              size="small"
              onClick={logout}
              sx={{
                color: "text.secondary",
                "&:hover": { color: "error.light" },
                transition: "color 0.15s",
              }}
            >
              <LogoutIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        </Box>
      )}
    </Box>
  );

  return (
    <Box sx={{ display: "flex", minHeight: "100%" }}>
      <Box component="nav" sx={{ width: { md: drawerWidth }, flexShrink: { md: 0 } }}>
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: "block", md: "none" },
            "& .MuiDrawer-paper": { width: drawerWidth, boxSizing: "border-box" },
          }}
        >
          {drawer}
        </Drawer>
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: "none", md: "block" },
            "& .MuiDrawer-paper": {
              width: drawerWidth,
              boxSizing: "border-box",
              borderRight: isDark
                ? "1px solid rgba(255,255,255,0.06)"
                : "1px solid rgba(15,23,42,0.08)",
              backgroundColor: isDark ? "rgba(9,18,34,0.94)" : "rgba(255,255,255,0.97)",
              backdropFilter: "blur(20px)",
            },
          }}
          open
        >
          {drawer}
        </Drawer>
      </Box>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          width: { md: `calc(100% - ${drawerWidth}px)` },
          pt: { xs: 2, sm: 3 },
          px: { xs: 2, sm: 3.5 },
          pb: 5,
          maxWidth: "100%",
        }}
      >
        {/* Mobile top bar */}
        <Box sx={{ display: { xs: "flex", md: "none" }, alignItems: "center", mb: 2.5, gap: 1 }}>
          <IconButton
            onClick={() => setMobileOpen(true)}
            size="small"
            sx={{ color: "text.secondary" }}
          >
            <MenuIcon fontSize="small" />
          </IconButton>
          <Typography variant="subtitle1" sx={{ flex: 1, fontWeight: 700 }}>
            {pageTitle}
          </Typography>
          <Chip
            size="small"
            label={health?.ok && health?.zabbix ? "Healthy" : "Degraded"}
            color={health?.ok && health?.zabbix ? "success" : "warning"}
            variant="outlined"
          />
        </Box>

        {children}
      </Box>

      {/* ── Notification stack (bottom-right) ── */}
      {notifications.length > 0 && (
        <Box
          sx={{
            position: "fixed",
            bottom: { xs: 16, sm: 24 },
            right: { xs: 8, sm: 24 },
            zIndex: 2000,
            display: "flex",
            flexDirection: "column-reverse",
            gap: 1,
            maxHeight: "80vh",
            overflowY: "auto",
            pointerEvents: "none",
            "& > *": { pointerEvents: "auto", maxWidth: "calc(100vw - 16px)" },
          }}
        >
          {notifications.length > 3 && (
            <Box
              sx={{ display: "flex", justifyContent: "flex-end", pr: 0.5 }}
              onClick={() => setNotifications([])}
            >
              <Typography
                sx={{
                  fontSize: "0.72rem",
                  color: "text.secondary",
                  cursor: "pointer",
                  "&:hover": { color: "text.primary" },
                }}
              >
                Dismiss all ({notifications.length})
              </Typography>
            </Box>
          )}
          {notifications.map((p) => (
            <NotifCard key={p.eventid} problem={p} onDismiss={() => dismissNotif(p.eventid)} />
          ))}
        </Box>
      )}

      {/* ── Notification center drawer ── */}
      <NotificationCenter
        open={notifCenterOpen}
        onClose={() => setNotifCenterOpen(false)}
        history={storedHistory}
        problems={activeProblems}
        lastReadClock={lastReadClock}
        clearedBefore={clearedBefore}
        onMarkAllRead={markAllRead}
        onClearHistory={clearHistory}
        onRefresh={refreshCenter}
        onAcknowledge={async (id) => {
          await api.acknowledgeProblem(id).catch(() => {});
          acknowledgeInHistory(id);
          // Re-fetch problems so the Ack chip updates in Active Problems tab
          api
            .getProblems()
            .then((r) => setActiveProblems(r.problems))
            .catch(() => {});
        }}
        loading={centerLoading}
      />
    </Box>
  );
};
