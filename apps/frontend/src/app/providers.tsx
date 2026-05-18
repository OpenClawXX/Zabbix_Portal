"use client";
import { CssBaseline, ThemeProvider } from "@mui/material";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import type { PropsWithChildren } from "react";
import { AuthProvider } from "./context/AuthContext";
import { ThemeModeProvider, useThemeMode } from "./context/ThemeContext";
import { AppShell } from "./layout/AppShell";
import { createAppTheme } from "./theme";

const ThemedApp = ({ children }: PropsWithChildren) => {
  const pathname = usePathname();
  const { mode } = useThemeMode();
  const theme = useMemo(() => createAppTheme(mode), [mode]);
  const isLogin = pathname === "/login";

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {isLogin ? children : <AppShell>{children}</AppShell>}
    </ThemeProvider>
  );
};

export const Providers = ({ children }: PropsWithChildren) => (
  <AuthProvider>
    <ThemeModeProvider>
      <ThemedApp>{children}</ThemedApp>
    </ThemeModeProvider>
  </AuthProvider>
);
