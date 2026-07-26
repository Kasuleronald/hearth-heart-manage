import { useQuery } from "@tanstack/react-query";
import { listDepartmentsFn } from "@/server/departments";

// Matches the cell term's own default plural ("Cell Fellowships" — see
// terminology.ts) so the department name reads naturally as "in charge of
// the Cell Fellowships." The department itself is created lazily, server
// side, the first time a cell expense claim is approved (see
// approveCellExpenseFn in server/cells.ts) — nothing here creates it.
export const CELL_FELLOWSHIPS_DEPARTMENT_NAME = "Cell Fellowships";

// Narrower than app-sidebar.tsx's generic "leads some department" check —
// this specifically grants church-wide cell powers, so it must only fire for
// the leader of the Cell Fellowships department, not any department.
export function useIsHeadOfCellFellowships(userId: string | undefined): boolean {
  const { data } = useQuery({ queryKey: ["departments"], queryFn: () => listDepartmentsFn() });
  if (!userId || !data) return false;
  const dept = data.find(
    (d) => d.name.trim().toLowerCase() === CELL_FELLOWSHIPS_DEPARTMENT_NAME.toLowerCase(),
  );
  return dept?.leaderId === userId;
}
