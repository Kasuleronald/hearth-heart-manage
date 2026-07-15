import { useCallback, useEffect, useState } from "react";

const THEME_KEY = "mychurch.theme";
export type Theme = "light" | "dark";

function getStoredTheme(): Theme | null {
  if (typeof window === "undefined") return null;
  const v = localStorage.getItem(THEME_KEY);
  return v === "light" || v === "dark" ? v : null;
}

function systemPrefersDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function getEffectiveTheme(): Theme {
  return getStoredTheme() ?? (systemPrefersDark() ? "dark" : "light");
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export function setTheme(theme: Theme) {
  localStorage.setItem(THEME_KEY, theme);
  applyTheme(theme);
  window.dispatchEvent(new Event("mychurch:theme"));
}

// The anti-flash inline script in __root.tsx already applies the right class
// before hydration, so read the live DOM rather than defaulting to "light"
// and flashing the toggle icon on mount.
function currentDomTheme(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(currentDomTheme);

  useEffect(() => {
    setThemeState(getEffectiveTheme());
    const onChange = () => setThemeState(getEffectiveTheme());
    window.addEventListener("mychurch:theme", onChange);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    // Only follow system changes while the user hasn't picked an explicit theme.
    const onSystemChange = () => {
      if (!getStoredTheme()) setThemeState(getEffectiveTheme());
    };
    media.addEventListener("change", onSystemChange);
    return () => {
      window.removeEventListener("mychurch:theme", onChange);
      media.removeEventListener("change", onSystemChange);
    };
  }, []);

  const toggle = useCallback(() => {
    setTheme(currentDomTheme() === "dark" ? "light" : "dark");
  }, []);

  return { theme, toggle };
}
