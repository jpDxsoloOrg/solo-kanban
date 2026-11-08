"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";

type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "light",
  toggleTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

/** Browser UI colors per theme; keep in sync with `viewport` in app/layout. */
const THEME_COLORS: Record<Theme, string> = {
  light: "#fcfcfc",
  dark: "#070b14",
};

function readStoredTheme(): Theme | null {
  try {
    const stored = localStorage.getItem("theme");
    return stored === "dark" || stored === "light" ? stored : null;
  } catch {
    return null;
  }
}

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "light";

  const stored = readStoredTheme();
  if (stored) return stored;

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/**
 * Point the browser's theme-color (status bar / PWA title bar) at an
 * explicitly chosen theme. Without a choice the media-query metas apply.
 */
function syncThemeColor(theme: Theme) {
  document
    .querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
    .forEach((meta) => meta.setAttribute("content", THEME_COLORS[theme]));
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");

  // Initialize from localStorage / OS preference
  useEffect(() => {
    const initial = getInitialTheme();
    setTheme(initial);
    document.documentElement.classList.toggle("dark", initial === "dark");
    if (readStoredTheme()) syncThemeColor(initial);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "light" ? "dark" : "light";
      try {
        localStorage.setItem("theme", next);
      } catch {
        // Storage unavailable (private mode): the choice lasts this visit.
      }
      document.documentElement.classList.toggle("dark", next === "dark");
      syncThemeColor(next);
      return next;
    });
  }, []);

  return (
    <ThemeContext value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext>
  );
}