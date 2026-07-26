import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { db, uid, type Role, type User, type DepartmentModule } from "./db";
import { loginFn, logoutFn, getCurrentSessionFn, changeUserPasswordFn } from "@/server/auth";

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

// Real, server-side session (see src/server/auth.ts) — idle-timeout and
// expiry are enforced there now, not client-side. Shape kept close to the
// old local-only Session so the ~25 files reading session.role/branchId/
// etc. didn't need individual changes when this stopped being localStorage.
export interface Session {
  userId: string;
  organizationId: string;
  organizationName: string;
  email: string;
  fullName: string;
  role: Role;
  branchId?: string; // undefined = church-wide access; set = scoped to that branch
  financeTier?: "A"; // elevated finance powers granted to a leader/cell_leader
  needsEmailUpdate?: boolean; // a placeholder email was auto-assigned — see §14
  allowedModules: DepartmentModule[]; // granted via the department this user leads, if any
  leadsDepartment: boolean; // true if they lead any department, even one with no modules granted
  ledDepartmentId?: string;
  emailNotificationsEnabled: boolean;
}

function toSession(data: Awaited<ReturnType<typeof getCurrentSessionFn>>): Session | null {
  if (!data || data.kind !== "user") return null;
  return {
    userId: data.userId,
    organizationId: data.organizationId,
    organizationName: data.organizationName,
    email: data.email,
    fullName: data.fullName,
    role: data.role,
    branchId: data.branchId,
    financeTier: data.financeTier,
    needsEmailUpdate: data.needsEmailUpdate,
    allowedModules: data.allowedModules,
    leadsDepartment: data.leadsDepartment,
    ledDepartmentId: data.ledDepartmentId,
    emailNotificationsEnabled: data.emailNotificationsEnabled,
  };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

// ---- Password hashing (PBKDF2 via WebCrypto) ----
async function pbkdf2(password: string, saltHex: string): Promise<string> {
  const enc = new TextEncoder();
  const salt = hexToBytes(saltHex);
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(password) as unknown as BufferSource,
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as unknown as BufferSource, iterations: 100_000, hash: "SHA-256" },
    key,
    256,
  );
  return bytesToHex(new Uint8Array(bits));
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltHex = bytesToHex(salt);
  const hash = await pbkdf2(password, saltHex);
  return `${saltHex}:${hash}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hash] = stored.split(":");
  if (!saltHex || !hash) return false;
  const check = await pbkdf2(password, saltHex);
  return check === hash;
}

// ---- Login throttling ----
// Purely client-side (no server to enforce this against), but it slows down
// casual brute-forcing on a shared device.
const LOGIN_ATTEMPTS_KEY = "mychurch.loginAttempts";
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 30 * 1000;

interface AttemptRecord {
  count: number;
  lockedUntil?: number;
}

function readAttempts(): Record<string, AttemptRecord> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(LOGIN_ATTEMPTS_KEY) ?? "{}") as Record<
      string,
      AttemptRecord
    >;
  } catch {
    return {};
  }
}
function writeAttempts(attempts: Record<string, AttemptRecord>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(LOGIN_ATTEMPTS_KEY, JSON.stringify(attempts));
}

export function getLoginLockoutMs(email: string): number {
  const rec = readAttempts()[email.trim().toLowerCase()];
  if (!rec?.lockedUntil) return 0;
  return Math.max(0, rec.lockedUntil - Date.now());
}

function recordFailedLogin(email: string) {
  const key = email.trim().toLowerCase();
  const attempts = readAttempts();
  const rec = attempts[key] ?? { count: 0 };
  rec.count += 1;
  if (rec.count >= MAX_ATTEMPTS) {
    rec.lockedUntil = Date.now() + LOCKOUT_MS;
    rec.count = 0;
  }
  attempts[key] = rec;
  writeAttempts(attempts);
}

function clearFailedLogins(email: string) {
  const key = email.trim().toLowerCase();
  const attempts = readAttempts();
  if (attempts[key]) {
    delete attempts[key];
    writeAttempts(attempts);
  }
}

// ---- Auth actions ----
export async function hasAnyUser(): Promise<boolean> {
  return (await db.users.count()) > 0;
}

export async function createUser(input: {
  email: string;
  password: string;
  fullName: string;
  role: Role;
  memberId?: string;
  branchId?: string;
  financeTier?: "A";
}): Promise<User> {
  const email = input.email.trim().toLowerCase();
  if (!isValidEmail(email)) throw new Error("Enter a valid email address");
  const existing = await db.users.where("email").equals(email).first();
  if (existing) throw new Error("An account with this email already exists");
  const user: User = {
    id: uid(),
    email,
    fullName: input.fullName.trim(),
    role: input.role,
    memberId: input.memberId,
    branchId: input.branchId,
    financeTier: input.financeTier,
    passwordHash: await hashPassword(input.password),
    createdAt: Date.now(),
  };
  await db.users.add(user);
  return user;
}

// Real, server-side login against Postgres (src/server/auth.ts's loginFn) —
// the client-side throttle above still wraps it as a defense-in-depth layer
// the server doesn't have yet.
export async function login(email: string, password: string): Promise<Session> {
  const lockoutMs = getLoginLockoutMs(email);
  if (lockoutMs > 0) {
    throw new Error(`Too many attempts. Try again in ${Math.ceil(lockoutMs / 1000)}s.`);
  }
  try {
    await loginFn({ data: { email, password } });
  } catch (err) {
    recordFailedLogin(email);
    throw err;
  }
  clearFailedLogins(email);
  const session = toSession(await getCurrentSessionFn());
  if (!session) throw new Error("Signed in, but couldn't load your session — try reloading");
  return session;
}

// `userId` is kept (unused) so callers don't need to change — the real
// backend identifies the account from the session cookie instead.
export async function changePassword(
  _userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  await changeUserPasswordFn({ data: { currentPassword, newPassword } });
}

// Admin-only: reset another user's password without knowing the old one.
export async function resetPassword(userId: string, newPassword: string): Promise<void> {
  if (newPassword.length < 8) throw new Error("Password must be at least 8 characters");
  await db.users.update(userId, { passwordHash: await hashPassword(newPassword) });
}

// ---- Password reset tokens (local-mode: no email delivery) ----
// An admin generates a token for a user and relays it to them out-of-band
// (in person, chat, etc.) — see the Users page. Built as a real token/expiry
// pair now so swapping in real email delivery later only changes how the
// token is *delivered*, not this logic.
export async function createPasswordResetToken(
  email: string,
): Promise<{ token: string; user: User }> {
  const u = await db.users.where("email").equals(email.trim().toLowerCase()).first();
  if (!u) throw new Error("No account with that email");
  const token = uid();
  await db.passwordResetTokens.add({
    token,
    userId: u.id,
    expiresAt: Date.now() + RESET_TOKEN_TTL_MS,
    used: false,
    createdAt: Date.now(),
  });
  return { token, user: u };
}

// ---- React hook ----
export function useSession() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["session"], queryFn: () => getCurrentSessionFn() });

  const signOut = useCallback(async () => {
    await logoutFn();
    queryClient.setQueryData(["session"], null);
    queryClient.invalidateQueries({ queryKey: ["session"] });
  }, [queryClient]);

  return { session: toSession(query.data ?? null), ready: !query.isLoading, signOut };
}

export function canManageUsers(role: Role) {
  return role === "admin";
}
// Cell-editing rights follow the cell's actual leaderId assignment, not the
// account's primary role — a Department Leader the Admin has assigned to lead
// a cell gets the same rights here as someone whose primary role is
// cell_leader.
export function canEditCell(role: Role, cellLeaderId: string | undefined, userId: string) {
  if (role === "admin" || role === "pastor") return true;
  return cellLeaderId === userId;
}
export function canEditClass(role: Role, facilitatorId: string | undefined, userId: string) {
  if (role === "admin" || role === "pastor") return true;
  return role === "cell_leader" && facilitatorId === userId;
}
export function canAccessGivings(role: Role, allowedModules: DepartmentModule[] = []) {
  return (
    role === "admin" ||
    role === "pastor" ||
    role === "treasurer" ||
    allowedModules.includes("givings")
  );
}
// A Pastor can view Givings but not record/edit/delete entries — that stays
// with Admin and Treasurer.
export function canManageGivings(role: Role) {
  return role === "admin" || role === "treasurer";
}
// View access: admin/pastor manage every department; a "leader" needs to see
// this page too, since it's the only place their own assignment shows up.
// `isAssignedLeader` covers someone whose primary role isn't "leader" (e.g. a
// cell_leader) but who the Admin has assigned to lead a specific department.
export function canAccessDepartments(role: Role, isAssignedLeader = false) {
  return role === "admin" || role === "pastor" || role === "leader" || isAssignedLeader;
}
export function canManageDepartments(role: Role) {
  return role === "admin" || role === "pastor";
}
export function canManageEvents(role: Role) {
  return role === "admin" || role === "pastor";
}
// Filling in an event's post-event report is a step below full event
// management — also open to whichever department leader has been granted
// the "events" module (Departments page), not just Admin/Pastor.
export function canSubmitEventReport(role: Role, allowedModules: DepartmentModule[] = []) {
  return canManageEvents(role) || allowedModules.includes("events");
}
export function canManageProjects(role: Role) {
  return role === "admin" || role === "pastor";
}
// Tier-A finance: an elevated permission tier layered onto the leader /
// cell_leader roles (not a new Role value), granted per-user via
// User.financeTier — see §8 of the feature brief.
export function isTierAFinanceLeader(role: Role, financeTier: "A" | undefined) {
  return (role === "leader" || role === "cell_leader") && financeTier === "A";
}
export function canAccessPartners(
  role: Role,
  financeTier?: "A",
  allowedModules: DepartmentModule[] = [],
) {
  return (
    role === "admin" ||
    role === "pastor" ||
    role === "treasurer" ||
    isTierAFinanceLeader(role, financeTier) ||
    allowedModules.includes("partners")
  );
}
// Departmental leaders, Pastors, and Admin can submit a requisition.
export function canSubmitRequisitions(role: Role) {
  return role === "leader" || role === "pastor" || role === "admin";
}
// Seen by Admin, Treasurer, Pastor, and Tier-A finance leaders — but only
// the first three can decide (approve/reject) one.
export function canViewRequisitions(role: Role, financeTier?: "A") {
  return (
    role === "admin" ||
    role === "pastor" ||
    role === "treasurer" ||
    isTierAFinanceLeader(role, financeTier)
  );
}
export function canDecideRequisitions(role: Role) {
  return role === "admin" || role === "pastor" || role === "treasurer";
}
// Anyone can add a member; editing or deleting an existing record (and
// assigning their member number) is admin-only.
export function canEditDeleteMembers(role: Role) {
  return role === "admin";
}
export function canManageBranches(role: Role) {
  return role === "admin";
}
// Bulk member import (spreadsheet template upload) — same elevated tier as
// every other org-wide administrative action, not the "anyone can add a
// member" rule that applies to the one-at-a-time form.
export function canImportMembers(role: Role) {
  return role === "admin" || role === "pastor";
}
// Reviewing (approve/reject) public self-registration submissions before
// they become real Member records.
export function canManageMemberRegistrations(role: Role) {
  return role === "admin" || role === "pastor";
}
export function canEnterExpenses(role: Role) {
  return role === "admin" || role === "treasurer";
}
// Cell-report offertory reconciliation (§9): a finance-role user records
// what was actually received; only Admin/Treasurer approve a cell leader's
// edit request.
export function canRecordOffertoryReceived(role: Role, financeTier?: "A") {
  return role === "admin" || role === "treasurer" || isTierAFinanceLeader(role, financeTier);
}
export function canApproveEditRequest(role: Role) {
  return role === "admin" || role === "treasurer";
}
// Currency toggle (§12): USD conversion is a finance-oversight feature, not
// a general display preference — everyone else only ever sees the base
// currency, regardless of the shared toggle state.
export function canToggleCurrency(role: Role, financeTier?: "A") {
  return role === "admin" || role === "treasurer" || isTierAFinanceLeader(role, financeTier);
}
export function canManageCurrencySettings(role: Role) {
  return role === "admin";
}
export function canManageWeekStartSetting(role: Role) {
  return role === "admin";
}
export function canManageBranding(role: Role) {
  return role === "admin";
}
// Pledges: any signed-in user can book one and sees only their own; these
// three cover the elevated finance-side powers.
export function canViewAllPledges(
  role: Role,
  financeTier?: "A",
  allowedModules: DepartmentModule[] = [],
) {
  return (
    role === "admin" ||
    role === "treasurer" ||
    isTierAFinanceLeader(role, financeTier) ||
    allowedModules.includes("pledges")
  );
}
export function canEditAnyPledge(role: Role, financeTier?: "A") {
  return role === "admin" || role === "treasurer" || isTierAFinanceLeader(role, financeTier);
}
// Delete / mark fulfilled / ban.
export function canManagePledgeStatus(role: Role, financeTier?: "A") {
  return role === "admin" || role === "treasurer" || isTierAFinanceLeader(role, financeTier);
}
// Restoring an archived pledge is narrower than the general management
// power above — Tier-A finance leaders can delete/fulfill/ban, but only
// Admin/Treasurer can bring an archived pledge back.
export function canRestorePledges(role: Role) {
  return role === "admin" || role === "treasurer";
}
// Branch-match check, layered on top of the role checks above: a church-wide
// user (branchId undefined) can reach every record; a branch-scoped user can
// only reach records in their own branch or church-wide records (branchId
// undefined on the record itself).
export function canAccessRecordBranch(
  userBranchId: string | undefined,
  recordBranchId: string | undefined,
) {
  return !userBranchId || !recordBranchId || userBranchId === recordBranchId;
}
