import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./db";

const CHURCH_NAME_KEY = "churchName";
const CHURCH_LOGO_KEY = "churchLogo"; // data URL — no file storage in local-first mode
export const DEFAULT_CHURCH_NAME = "My Church";

// A logo is stored as a base64 data URL directly in Settings (same generic
// key/value table as currency/week-start), since there's no file/blob
// storage in this local-first app. Capped well under IndexedDB's practical
// limits so one church logo can't balloon the local database.
export const MAX_LOGO_BYTES = 500 * 1024;

export function useChurchBranding(): { name: string; logoDataUrl: string | undefined } {
  const nameRow = useLiveQuery(() => db.settings.get(CHURCH_NAME_KEY), []);
  const logoRow = useLiveQuery(() => db.settings.get(CHURCH_LOGO_KEY), []);
  return {
    name: nameRow?.value || DEFAULT_CHURCH_NAME,
    logoDataUrl: logoRow?.value || undefined,
  };
}

export async function setChurchName(name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Church name can't be empty");
  await db.settings.put({ key: CHURCH_NAME_KEY, value: trimmed });
}

export async function setChurchLogo(dataUrl: string): Promise<void> {
  // Rough byte-size check on a base64 data URL: ~3/4 byte per character.
  const approxBytes = (dataUrl.length * 3) / 4;
  if (approxBytes > MAX_LOGO_BYTES) {
    throw new Error(`Logo is too large — keep it under ${Math.round(MAX_LOGO_BYTES / 1024)}KB`);
  }
  await db.settings.put({ key: CHURCH_LOGO_KEY, value: dataUrl });
}

export async function clearChurchLogo(): Promise<void> {
  await db.settings.delete(CHURCH_LOGO_KEY);
}
