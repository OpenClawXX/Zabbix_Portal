"use client";
import ComputerOutlinedIcon from "@mui/icons-material/ComputerOutlined";
import DarkModeOutlinedIcon from "@mui/icons-material/DarkModeOutlined";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import LightModeOutlinedIcon from "@mui/icons-material/LightModeOutlined";
import LogoutIcon from "@mui/icons-material/Logout";
import MenuIcon from "@mui/icons-material/Menu";
import PeopleOutlinedIcon from "@mui/icons-material/PeopleOutlined";
import PlaylistAddOutlinedIcon from "@mui/icons-material/PlaylistAddOutlined";
import {
  Box,
  Chip,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Tooltip,
  Typography,
} from "@mui/material";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { PropsWithChildren, ReactNode } from "react";
import { useAuth } from "../context/AuthContext";
import { useThemeMode } from "../context/ThemeContext";
import { api } from "../api";

const drawerWidth = 232;

type NavItem = { href: string; label: string; icon: ReactNode; adminOnly?: boolean };

const navItems: NavItem[] = [
  { href: "/", label: "Overview", icon: <DashboardOutlinedIcon sx={{ fontSize: 18 }} /> },
  { href: "/hosts", label: "Hosts", icon: <ComputerOutlinedIcon sx={{ fontSize: 18 }} /> },
  { href: "/items", label: "Items", icon: <PlaylistAddOutlinedIcon sx={{ fontSize: 18 }} /> },
  { href: "/teams", label: "Teams", icon: <GroupsOutlinedIcon sx={{ fontSize: 18 }} /> },
  { href: "/users", label: "Users", icon: <PeopleOutlinedIcon sx={{ fontSize: 18 }} />, adminOnly: true },
];

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

export const AppShell = ({ children }: PropsWithChildren) => {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { mode, toggle: toggleMode } = useThemeMode();
  const isDark = mode === "dark";
  const [mobileOpen, setMobileOpen] = useState(false);
  const [health, setHealth] = useState<{ ok: boolean; zabbix: boolean } | null>(null);

  const pageTitle = useMemo(
    () => navItems.find((n) => n.href === pathname)?.label ?? "Zabbix DevOps",
    [pathname],
  );

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
    return () => { cancelled = true; window.clearInterval(t); };
  }, []);

  const initials = user?.username.slice(0, 2).toUpperCase() ?? "??";

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
            <Typography sx={{ fontWeight: 700, fontSize: "0.875rem", lineHeight: 1.2, letterSpacing: 0.1 }}>
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
              {isDark
                ? <LightModeOutlinedIcon sx={{ fontSize: 17 }} />
                : <DarkModeOutlinedIcon sx={{ fontSize: 17 }} />
              }
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      <Divider />

      {/* Nav */}
      <List sx={{ px: 1.25, pt: 1.5, flex: 1 }} disablePadding>
        {navItems.filter((item) => {
          if (!item.adminOnly) return true;
          const roles = user?.roles ?? [];
          return roles.includes("root") || roles.includes("team_lead");
        }).map((item) => {
          const selected = pathname === item.href;
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
                {item.icon}
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
            <Typography sx={{ fontSize: "0.65rem", fontWeight: 700, color: "#fff", letterSpacing: 0.5 }}>
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
                  color={r === "root" ? "error" : r === "team_lead" ? "primary" : r === "operator" ? "secondary" : r === "auditor" ? "warning" : "default"}
                  sx={{ height: 16, fontSize: "0.58rem" }}
                />
              ))}
            </Box>
          </Box>
          <Tooltip title="Sign out">
            <IconButton
              size="small"
              onClick={logout}
              sx={{ color: "text.secondary", "&:hover": { color: "error.light" }, transition: "color 0.15s" }}
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
              borderRight: isDark ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(15,23,42,0.08)",
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
          <IconButton onClick={() => setMobileOpen(true)} size="small" sx={{ color: "text.secondary" }}>
            <MenuIcon fontSize="small" />
          </IconButton>
          <Typography variant="subtitle1" sx={{ flex: 1, fontWeight: 700 }}>{pageTitle}</Typography>
          <Chip
            size="small"
            label={health?.ok && health?.zabbix ? "Healthy" : "Degraded"}
            color={health?.ok && health?.zabbix ? "success" : "warning"}
            variant="outlined"
          />
        </Box>

        {children}
      </Box>
    </Box>
  );
};
