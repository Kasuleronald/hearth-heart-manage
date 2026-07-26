import { useQuery } from "@tanstack/react-query";
import { listSettingsFn, setSettingFn } from "@/server/settings";

const CHURCH_NAME_KEY = "churchName";
const CHURCH_LOGO_KEY = "churchLogo"; // data URL — stored as plain text, same as any other setting
export const DEFAULT_CHURCH_NAME = "My Church";

// A logo is stored as a base64 data URL directly in Settings (same generic
// key/value table as currency/week-start), since there's no separate
// file/blob storage. Capped well under what a `text` column comfortably
// holds, so one church logo can't balloon the settings table.
export const MAX_LOGO_BYTES = 500 * 1024;

export function useChurchBranding(): { name: string; logoDataUrl: string | undefined } {
  const { data } = useQuery({ queryKey: ["settings"], queryFn: () => listSettingsFn() });
  return {
    name: data?.[CHURCH_NAME_KEY] || DEFAULT_CHURCH_NAME,
    logoDataUrl: data?.[CHURCH_LOGO_KEY] || undefined,
  };
}

export async function setChurchName(name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Church name can't be empty");
  await setSettingFn({ data: { key: CHURCH_NAME_KEY, value: trimmed } });
}

export async function setChurchLogo(dataUrl: string): Promise<void> {
  // Rough byte-size check on a base64 data URL: ~3/4 byte per character.
  const approxBytes = (dataUrl.length * 3) / 4;
  if (approxBytes > MAX_LOGO_BYTES) {
    throw new Error(`Logo is too large — keep it under ${Math.round(MAX_LOGO_BYTES / 1024)}KB`);
  }
  await setSettingFn({ data: { key: CHURCH_LOGO_KEY, value: dataUrl } });
}

export async function clearChurchLogo(): Promise<void> {
  await setSettingFn({ data: { key: CHURCH_LOGO_KEY, value: "" } });
}
