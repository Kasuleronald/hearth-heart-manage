import { useEffect, useState } from "react";
import { useBaseCurrency, formatCurrency } from "./currency";

const TOGGLE_KEY = "mychurch.currencyToggle";
const EVENT_NAME = "mychurch:currencyToggle";

export type CurrencyMode = "base" | "usd";

function readToggle(): CurrencyMode {
  if (typeof window === "undefined") return "base";
  return localStorage.getItem(TOGGLE_KEY) === "usd" ? "usd" : "base";
}

// Shared, global "am I viewing base currency or USD" preference — same
// localStorage + custom-event pattern as useBranchFilter, so every screen
// stays in sync without prop drilling.
export function setCurrencyToggle(mode: CurrencyMode) {
  if (typeof window === "undefined") return;
  localStorage.setItem(TOGGLE_KEY, mode);
  window.dispatchEvent(new Event(EVENT_NAME));
}

export function useCurrencyToggle(): [CurrencyMode, (mode: CurrencyMode) => void] {
  const [value, setValue] = useState<CurrencyMode>(readToggle);

  useEffect(() => {
    const on = () => setValue(readToggle());
    window.addEventListener(EVENT_NAME, on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(EVENT_NAME, on);
      window.removeEventListener("storage", on);
    };
  }, []);

  return [value, setCurrencyToggle];
}

// Combines the base-currency setting with the toggle into what a screen
// should actually show. canToggle gates it at the call site (only
// Treasurer/Admin/Tier-A finance leaders ever see anything but base
// currency — see canToggleCurrency in auth.ts) — everyone else is always
// pinned to "base" regardless of what the shared toggle is currently set to.
export function useDisplayCurrency(canToggle: boolean) {
  const base = useBaseCurrency();
  const [toggle] = useCurrencyToggle();
  const mode: CurrencyMode = canToggle ? toggle : "base";
  const displayCode = mode === "usd" ? "USD" : base.code;

  function convert(amount: number): number {
    return mode === "usd" ? amount / base.rate : amount;
  }
  function format(amount: number): string {
    return formatCurrency(convert(amount), displayCode);
  }

  return { base, mode, displayCode, convert, format };
}
