"use client";
import { createContext, useContext, useEffect, useState } from "react";
import type { PropsWithChildren } from "react";

type Mode = "dark" | "light";

const ThemeContext = createContext<{ mode: Mode; toggle: () => void }>({
  mode: "dark",
  toggle: () => {},
});

export const ThemeModeProvider = ({ children }: PropsWithChildren) => {
  const [mode, setMode] = useState<Mode>("dark");

  useEffect(() => {
    const saved = localStorage.getItem("theme-mode") as Mode | null;
    if (saved === "light" || saved === "dark") setMode(saved);
  }, []);

  const toggle = () => {
    setMode((m) => {
      const next = m === "dark" ? "light" : "dark";
      localStorage.setItem("theme-mode", next);
      return next;
    });
  };

  return <ThemeContext.Provider value={{ mode, toggle }}>{children}</ThemeContext.Provider>;
};

export const useThemeMode = () => useContext(ThemeContext);
