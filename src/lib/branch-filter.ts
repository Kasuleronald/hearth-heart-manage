import { useEffect, useState } from "react";

const BRANCH_FILTER_KEY = "mychurch.branchFilter";
const EVENT_NAME = "mychurch:branchFilter";

function readBranchFilter(): string {
  if (typeof window === "undefined") return "all";
  return localStorage.getItem(BRANCH_FILTER_KEY) ?? "all";
}

// The church-wide "which branch am I viewing" selection — only meaningful
// for church-wide users (branch-scoped users never see the switcher and are
// always pinned to their own branch, see useEffectiveBranch below).
// "all" = no filter; otherwise a specific Branch.id.
export function setBranchFilter(id: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(BRANCH_FILTER_KEY, id);
  window.dispatchEvent(new Event(EVENT_NAME));
}

export function useBranchFilter(): [string, (id: string) => void] {
  const [value, setValue] = useState<string>(readBranchFilter);

  useEffect(() => {
    const on = () => setValue(readBranchFilter());
    window.addEventListener(EVENT_NAME, on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(EVENT_NAME, on);
      window.removeEventListener("storage", on);
    };
  }, []);

  return [value, setBranchFilter];
}

// The filter a page should actually apply: a branch-scoped user is always
// pinned to their own branch (the switcher never overrides this); a
// church-wide user gets whatever they last picked in the switcher.
export function useEffectiveBranch(userBranchId: string | undefined): string {
  const [selected] = useBranchFilter();
  return userBranchId ?? selected;
}

// Does a record pass the current filter? A church-wide record (branchId
// undefined) always passes — the filter only excludes records that belong to
// a *different* branch than the one currently selected.
export function matchesBranchFilter(filter: string, recordBranchId: string | undefined): boolean {
  return filter === "all" || !recordBranchId || recordBranchId === filter;
}
