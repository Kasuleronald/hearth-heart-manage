import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./db";

// Some churches call their small groups "Zonal Fellowships", "Garages", "Patria
// Gatherings", etc. — this lets an admin rename the term app-wide instead of it
// being hardcoded as "Cell Fellowship(s)". Stored in the existing `settings`
// key/value table; the underlying data model (Cell, cellId, /cells route) is
// unchanged, only the displayed label.
export const DEFAULT_CELL_SINGULAR = "Cell Fellowship";
export const DEFAULT_CELL_PLURAL = "Cell Fellowships";
const SINGULAR_KEY = "cellTermSingular";
const PLURAL_KEY = "cellTermPlural";

export function useCellTerm() {
  const singularRow = useLiveQuery(() => db.settings.get(SINGULAR_KEY), []);
  const pluralRow = useLiveQuery(() => db.settings.get(PLURAL_KEY), []);
  const singular = singularRow?.value || DEFAULT_CELL_SINGULAR;
  const plural = pluralRow?.value || DEFAULT_CELL_PLURAL;
  return { singular, plural, leaderLabel: `${singular} Leader` };
}

export async function setCellTerm(singular: string, plural: string) {
  await db.settings.bulkPut([
    { key: SINGULAR_KEY, value: singular.trim() || DEFAULT_CELL_SINGULAR },
    { key: PLURAL_KEY, value: plural.trim() || DEFAULT_CELL_PLURAL },
  ]);
}
