import { useEffect, useMemo, useState } from 'react'
import type { PropsWithChildren, ReactNode } from 'react'
import { Chip, Box, Divider, Drawer, IconButton, List, ListItemButton, ListItemIcon, ListItemText, Typography } from '@mui/material'
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined'
import ComputerOutlinedIcon from '@mui/icons-material/ComputerOutlined'
import PlaylistAddOutlinedIcon from '@mui/icons-material/PlaylistAddOutlined'
import MenuIcon from '@mui/icons-material/Menu'
import { Link, useLocation } from 'react-router-dom'
import { api } from '../api'

const drawerWidth = 260

type NavItem = {
  to: string
  label: string
  icon: ReactNode
}

const navItems: NavItem[] = [
  { to: '/', label: 'Overview', icon: <DashboardOutlinedIcon /> },
  { to: '/hosts', label: 'Hosts', icon: <ComputerOutlinedIcon /> },
  { to: '/items', label: 'Items', icon: <PlaylistAddOutlinedIcon /> },
]

export function AppShell({ children }: PropsWithChildren) {
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [health, setHealth] = useState<{ ok: boolean; zabbix: boolean } | null>(null)
  const [loadingHealth, setLoadingHealth] = useState(false)

  const pageTitle = useMemo(
    () => navItems.find((n) => n.to === location.pathname)?.label ?? 'Zabbix DevOps',
    [location.pathname],
  )

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoadingHealth(true)
      try {
        const h = await api.health()
        if (!cancelled) setHealth({ ok: h.status === 'online', zabbix: !!h.zabbix_connected })
      } catch {
        if (!cancelled) setHealth({ ok: false, zabbix: false })
      } finally {
        if (!cancelled) setLoadingHealth(false)
      }
    }
    load()
    const t = window.setInterval(load, 10_000)
    return () => {
      cancelled = true
      window.clearInterval(t)
    }
  }, [])

  const drawer = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ p: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 800, letterSpacing: 0.2 }}>
          Zabbix DevOps
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Control plane
        </Typography>
      </Box>
      <Divider />
      <List sx={{ px: 1, pt: 1 }}>
        {navItems.map((item) => {
          const selected = location.pathname === item.to
          return (
            <ListItemButton
              key={item.to}
              component={Link}
              to={item.to}
              selected={selected}
              sx={{
                borderRadius: 3,
                mb: 0.75,
                backgroundColor: selected ? 'rgba(15,23,42,0.82)' : 'transparent',
                border: '1px solid',
                borderColor: selected ? 'rgba(34,211,238,0.42)' : 'transparent',
                '&:hover': {
                  backgroundColor: 'rgba(51,65,85,0.65)',
                },
              }}
            >
              <ListItemIcon sx={{ minWidth: 40 }}>{item.icon}</ListItemIcon>
              <ListItemText primary={item.label} />
            </ListItemButton>
          )
        })}
      </List>
      <Box sx={{ flex: 1 }} />
      <Divider />
      <Box sx={{ p: 2 }}>
        <Typography variant="caption" color="text.secondary">
          API: http://localhost:8000
        </Typography>
      </Box>
    </Box>
  )

  return (
    <Box sx={{ display: 'flex', minHeight: '100%' }}>
      <Box component="nav" sx={{ width: { md: drawerWidth }, flexShrink: { md: 0 } }}>
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: 'block', md: 'none' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
          }}
        >
          {drawer}
        </Drawer>
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', md: 'block' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: drawerWidth,
              borderRight: '1px solid rgba(255,255,255,0.1)',
              backgroundColor: 'rgba(15, 23, 42, 0.72)',
              backdropFilter: 'blur(12px)',
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
          px: { xs: 2, sm: 3 },
          pb: 4,
        }}
      >
        <Box sx={{ display: { xs: 'flex', md: 'none' }, alignItems: 'center', mb: 2 }}>
          <IconButton
            color="inherit"
            edge="start"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            sx={{ mr: 1 }}
          >
            <MenuIcon />
          </IconButton>
          <Typography variant="subtitle1" sx={{ fontWeight: 800, letterSpacing: 0.2, flex: 1 }}>
            {pageTitle}
          </Typography>
          {loadingHealth ? (
            <Typography variant="caption" color="text.secondary">
              Checking...
            </Typography>
          ) : (
            <Chip
              size="small"
              variant="outlined"
              label={health?.ok && health?.zabbix ? 'Healthy' : 'Check status'}
              color={health?.ok && health?.zabbix ? 'success' : 'warning'}
            />
          )}
        </Box>
        {children}
      </Box>
    </Box>
  )
}

