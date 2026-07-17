import { useCurrencyToggle } from "@/lib/currency-toggle";

// A small "[Base] | USD" switch shown near amount displays — only rendered
// where the caller has already confirmed canToggleCurrency(role, financeTier),
// since everyone else only ever sees the base currency.
export function CurrencyToggle({ baseCode }: { baseCode: string }) {
  const [mode, setMode] = useCurrencyToggle();

  return (
    <div className="inline-flex overflow-hidden rounded-md border text-xs">
      <button
        type="button"
        className={`px-2 py-1 ${mode === "base" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
        onClick={() => setMode("base")}
      >
        {baseCode}
      </button>
      <button
        type="button"
        className={`px-2 py-1 ${mode === "usd" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
        onClick={() => setMode("usd")}
      >
        USD
      </button>
    </div>
  );
}
