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

function currentDomTheme(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function useTheme() {
  // Must match the server's render deterministically ("light", since there's
  // no `document` there) — reading the live DOM here instead (as an earlier
  // version did, to dodge an icon flash) made the client's first render
  // diverge from the server's whenever the effective theme was "dark",
  // which is a hard React hydration failure (error #418), not just a
  // cosmetic mismatch. The effect below corrects the icon immediately after
  // mount; the page's actual background/text already render correctly from
  // the anti-flash inline script in __root.tsx, so only the toggle icon
  // itself is ever briefly wrong, never the page.
  const [theme, setThemeState] = useState<Theme>("light");

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
