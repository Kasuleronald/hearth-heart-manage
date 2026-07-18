import { useLiveQuery } from "dexie-react-hooks";
import { db, uid, type Department } from "./db";

// Matches the cell term's own default plural ("Cell Fellowships" — see
// terminology.ts) so the department name reads naturally as "in charge of
// the Cell Fellowships."
export const CELL_FELLOWSHIPS_DEPARTMENT_NAME = "Cell Fellowships";

// Idempotent, case-insensitive — safe to call repeatedly (e.g. once per
// session, and again defensively before posting an approved cell expense).
export async function ensureCellFellowshipsDepartment(): Promise<Department> {
  const existing = await db.departments
    .filter((d) => d.name.trim().toLowerCase() === CELL_FELLOWSHIPS_DEPARTMENT_NAME.toLowerCase())
    .first();
  if (existing) return existing;
  const department: Department = {
    id: uid(),
    name: CELL_FELLOWSHIPS_DEPARTMENT_NAME,
    createdAt: Date.now(),
  };
  await db.departments.add(department);
  return department;
}

// Narrower than app-sidebar.tsx's generic "leads some department" check —
// this specifically grants church-wide cell powers, so it must only fire for
// the leader of the Cell Fellowships department, not any department.
export function useIsHeadOfCellFellowships(userId: string | undefined): boolean {
  return (
    useLiveQuery(async () => {
      if (!userId) return false;
      const dept = await db.departments
        .filter(
          (d) => d.name.trim().toLowerCase() === CELL_FELLOWSHIPS_DEPARTMENT_NAME.toLowerCase(),
        )
        .first();
      return dept?.leaderId === userId;
    }, [userId]) ?? false
  );
}
