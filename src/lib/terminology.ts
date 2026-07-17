import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./db";

// Some churches use different words for the same underlying concept — "Cell
// Fellowship" vs. "Zonal Fellowship", "Department" vs. "Ministry", etc. This
// registry lets an admin rename any of them app-wide from Settings without
// touching the underlying data model (routes, field names, and permission
// checks are untouched — only the displayed label changes). Stored in the
// existing `settings` key/value table as `{key}TermSingular` / `{key}TermPlural`.
export const TERM_DEFINITIONS = [
  { key: "cell", defaultSingular: "Cell Fellowship", defaultPlural: "Cell Fellowships" },
  { key: "department", defaultSingular: "Department", defaultPlural: "Departments" },
  { key: "class", defaultSingular: "Class", defaultPlural: "Classes" },
  { key: "requisition", defaultSingular: "Requisition", defaultPlural: "Requisitions" },
  { key: "branch", defaultSingular: "Branch", defaultPlural: "Branches" },
] as const;

export type TermKey = (typeof TERM_DEFINITIONS)[number]["key"];

function keysFor(key: TermKey) {
  return { singularKey: `${key}TermSingular`, pluralKey: `${key}TermPlural` };
}

export function useTerm(key: TermKey) {
  const def = TERM_DEFINITIONS.find((d) => d.key === key)!;
  const { singularKey, pluralKey } = keysFor(key);
  const singularRow = useLiveQuery(() => db.settings.get(singularKey), [singularKey]);
  const pluralRow = useLiveQuery(() => db.settings.get(pluralKey), [pluralKey]);
  const singular = singularRow?.value || def.defaultSingular;
  const plural = pluralRow?.value || def.defaultPlural;
  return { singular, plural, leaderLabel: `${singular} Leader` };
}

export async function setTerm(key: TermKey, singular: string, plural: string) {
  const def = TERM_DEFINITIONS.find((d) => d.key === key)!;
  const { singularKey, pluralKey } = keysFor(key);
  await db.settings.bulkPut([
    { key: singularKey, value: singular.trim() || def.defaultSingular },
    { key: pluralKey, value: plural.trim() || def.defaultPlural },
  ]);
}

// Thin wrapper kept so existing call sites (sidebar, dashboard, member pages,
// etc.) don't all need touching for this generalization.
export const DEFAULT_CELL_SINGULAR = TERM_DEFINITIONS[0].defaultSingular;
export const DEFAULT_CELL_PLURAL = TERM_DEFINITIONS[0].defaultPlural;
export function useCellTerm() {
  return useTerm("cell");
}
export async function setCellTerm(singular: string, plural: string) {
  await setTerm("cell", singular, plural);
}
