import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./db";

// A practical list of common ISO 4217 codes — not the full ~180-code set,
// just what a church is realistically likely to use as its base currency.
export const CURRENCIES: { code: string; name: string }[] = [
  { code: "UGX", name: "Ugandan Shilling" },
  { code: "USD", name: "US Dollar" },
  { code: "EUR", name: "Euro" },
  { code: "GBP", name: "British Pound" },
  { code: "KES", name: "Kenyan Shilling" },
  { code: "TZS", name: "Tanzanian Shilling" },
  { code: "RWF", name: "Rwandan Franc" },
  { code: "BIF", name: "Burundian Franc" },
  { code: "SSP", name: "South Sudanese Pound" },
  { code: "ETB", name: "Ethiopian Birr" },
  { code: "NGN", name: "Nigerian Naira" },
  { code: "GHS", name: "Ghanaian Cedi" },
  { code: "ZAR", name: "South African Rand" },
  { code: "ZMW", name: "Zambian Kwacha" },
  { code: "MWK", name: "Malawian Kwacha" },
  { code: "BWP", name: "Botswana Pula" },
  { code: "XAF", name: "Central African CFA Franc" },
  { code: "XOF", name: "West African CFA Franc" },
  { code: "EGP", name: "Egyptian Pound" },
  { code: "MAD", name: "Moroccan Dirham" },
  { code: "INR", name: "Indian Rupee" },
  { code: "PKR", name: "Pakistani Rupee" },
  { code: "PHP", name: "Philippine Peso" },
  { code: "IDR", name: "Indonesian Rupiah" },
  { code: "MYR", name: "Malaysian Ringgit" },
  { code: "SGD", name: "Singapore Dollar" },
  { code: "CNY", name: "Chinese Yuan" },
  { code: "JPY", name: "Japanese Yen" },
  { code: "AED", name: "UAE Dirham" },
  { code: "CAD", name: "Canadian Dollar" },
  { code: "AUD", name: "Australian Dollar" },
  { code: "CHF", name: "Swiss Franc" },
  { code: "SEK", name: "Swedish Krona" },
  { code: "BRL", name: "Brazilian Real" },
  { code: "MXN", name: "Mexican Peso" },
] as const;

export const DEFAULT_BASE_CURRENCY = "UGX";
export const DEFAULT_BASE_RATE = 3700; // approx UGX per 1 USD — an editable starting point, not a live rate

const BASE_CURRENCY_KEY = "baseCurrency";
const BASE_RATE_KEY = "baseCurrencyToUsdRate";
const BASE_RATE_UPDATED_KEY = "baseCurrencyRateUpdatedAt";

// The church's configured base/local currency + its rate to USD. Data is
// always stored in this currency — conversion only ever happens at
// display/export time, using whatever the *current* rate is (no historical
// rate tracking — see §12 of the feature brief).
export function useBaseCurrency() {
  const codeRow = useLiveQuery(() => db.settings.get(BASE_CURRENCY_KEY), []);
  const rateRow = useLiveQuery(() => db.settings.get(BASE_RATE_KEY), []);
  const updatedRow = useLiveQuery(() => db.settings.get(BASE_RATE_UPDATED_KEY), []);
  const code = codeRow?.value || DEFAULT_BASE_CURRENCY;
  const rateNum = rateRow?.value ? Number(rateRow.value) : DEFAULT_BASE_RATE;
  const rate = Number.isFinite(rateNum) && rateNum > 0 ? rateNum : DEFAULT_BASE_RATE;
  const updatedAt = updatedRow?.value ? Number(updatedRow.value) : undefined;
  return { code, rate, updatedAt };
}

export async function setBaseCurrency(code: string, rate: number) {
  await db.settings.bulkPut([
    { key: BASE_CURRENCY_KEY, value: code },
    { key: BASE_RATE_KEY, value: String(rate) },
    { key: BASE_RATE_UPDATED_KEY, value: String(Date.now()) },
  ]);
}

export function formatCurrency(amount: number, currencyCode: string): string {
  return `${currencyCode} ${amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}
