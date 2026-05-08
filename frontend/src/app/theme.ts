import { createTheme } from '@mui/material/styles'
import type { Shadows } from '@mui/material/styles'

export const appTheme = createTheme({
  shape: { borderRadius: 16 },
  typography: {
    fontFamily: ['Inter', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'].join(','),
  },
  palette: {
    mode: 'dark',
    primary: { main: '#22d3ee' },
    secondary: { main: '#34d399' },
    divider: 'rgba(255,255,255,0.08)',
    background: {
      default: '#0f172a',
      paper: '#1e293b',
    },
  },
  shadows: [
    'none',
    '0px 2px 12px rgba(0,0,0,0.25)',
    ...Array.from({ length: 23 }).map(() => '0px 8px 30px rgba(0,0,0,0.35)'),
  ] as Shadows,
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundImage:
            'radial-gradient(900px 400px at 20% -10%, rgba(34,211,238,0.22), transparent 60%), radial-gradient(700px 350px at 90% 0%, rgba(52,211,153,0.14), transparent 55%)',
          backgroundAttachment: 'fixed',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: 'rgba(30, 41, 59, 0.72)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255,255,255,0.12)',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 16,
        },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { textTransform: 'none', fontWeight: 700, borderRadius: 12 },
      },
    },
    MuiTextField: {
      defaultProps: { size: 'small' },
    },
    MuiInputBase: {
      styleOverrides: {
        root: {
          borderRadius: 12,
        },
      },
    },
  },
})

