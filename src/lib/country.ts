import { useQuery } from "@tanstack/react-query";
import { listSettingsFn, setSettingFn } from "@/server/settings";

export interface Country {
  code: string; // ISO 3166-1 alpha-2
  name: string;
  callingCode: string; // leading "+"
}

// Same regional bias as the Currencies list — common African countries plus
// major global ones a church is realistically likely to be based in.
export const COUNTRIES: Country[] = [
  { code: "UG", name: "Uganda", callingCode: "+256" },
  { code: "KE", name: "Kenya", callingCode: "+254" },
  { code: "TZ", name: "Tanzania", callingCode: "+255" },
  { code: "RW", name: "Rwanda", callingCode: "+250" },
  { code: "BI", name: "Burundi", callingCode: "+257" },
  { code: "SS", name: "South Sudan", callingCode: "+211" },
  { code: "ET", name: "Ethiopia", callingCode: "+251" },
  { code: "NG", name: "Nigeria", callingCode: "+234" },
  { code: "GH", name: "Ghana", callingCode: "+233" },
  { code: "ZA", name: "South Africa", callingCode: "+27" },
  { code: "ZM", name: "Zambia", callingCode: "+260" },
  { code: "MW", name: "Malawi", callingCode: "+265" },
  { code: "BW", name: "Botswana", callingCode: "+267" },
  { code: "EG", name: "Egypt", callingCode: "+20" },
  { code: "MA", name: "Morocco", callingCode: "+212" },
  { code: "US", name: "United States", callingCode: "+1" },
  { code: "GB", name: "United Kingdom", callingCode: "+44" },
  { code: "CA", name: "Canada", callingCode: "+1" },
  { code: "DE", name: "Germany", callingCode: "+49" },
  { code: "FR", name: "France", callingCode: "+33" },
  { code: "IN", name: "India", callingCode: "+91" },
  { code: "PK", name: "Pakistan", callingCode: "+92" },
  { code: "PH", name: "Philippines", callingCode: "+63" },
  { code: "ID", name: "Indonesia", callingCode: "+62" },
  { code: "MY", name: "Malaysia", callingCode: "+60" },
  { code: "SG", name: "Singapore", callingCode: "+65" },
  { code: "CN", name: "China", callingCode: "+86" },
  { code: "JP", name: "Japan", callingCode: "+81" },
  { code: "AE", name: "United Arab Emirates", callingCode: "+971" },
  { code: "AU", name: "Australia", callingCode: "+61" },
  { code: "BR", name: "Brazil", callingCode: "+55" },
  { code: "MX", name: "Mexico", callingCode: "+52" },
  { code: "SA", name: "Saudi Arabia", callingCode: "+966" },
  { code: "SE", name: "Sweden", callingCode: "+46" },
  { code: "CH", name: "Switzerland", callingCode: "+41" },
];

export const DEFAULT_COUNTRY_CODE = "UG";
const COUNTRY_KEY = "country";

export function findCountry(code: string): Country {
  return COUNTRIES.find((c) => c.code === code) ?? COUNTRIES[0];
}

// The church's own country — a real per-organization setting (same table as
// Currency/Terminology/Week-start). Used to default the country code shown
// in phone number fields across the app.
export function useCountry(): Country {
  const { data } = useQuery({ queryKey: ["settings"], queryFn: () => listSettingsFn() });
  return findCountry(data?.[COUNTRY_KEY] || DEFAULT_COUNTRY_CODE);
}

export async function setCountry(code: string): Promise<void> {
  if (!COUNTRIES.some((c) => c.code === code)) throw new Error("Unknown country");
  await setSettingFn({ data: { key: COUNTRY_KEY, value: code } });
}
