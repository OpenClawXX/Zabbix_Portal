"use client";
import { CssBaseline, ThemeProvider } from "@mui/material";
import type { PropsWithChildren } from "react";
import { AppShell } from "./layout/AppShell";
import { appTheme } from "./theme";

export const Providers = ({ children }: PropsWithChildren) => (
  <ThemeProvider theme={appTheme}>
    <CssBaseline />
    <AppShell>{children}</AppShell>
  </ThemeProvider>
);
