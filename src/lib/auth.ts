import { useEffect, useState, useCallback } from "react";
import { db, uid, type Role, type User } from "./db";

const SESSION_KEY = "mychurch.session";
const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const TOUCH_THROTTLE_MS = 60 * 1000; // don't rewrite storage more than once a minute
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

export interface Session {
  userId: string;
  email: string;
  fullName: string;
  role: Role;
  branchId?: string; // undefined = church-wide access; set = scoped to that branch
  financeTier?: "A"; // elevated finance powers granted to a leader/cell_leader
  expiresAt: number;
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

// ---- Session storage ----
export function getSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    if (!s.expiresAt || s.expiresAt < Date.now()) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return s;
  } catch {
    return null;
  }
}
export function setSession(s: Session | null) {
  if (typeof window === "undefined") return;
  if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  else localStorage.removeItem(SESSION_KEY);
  window.dispatchEvent(new Event("mychurch:session"));
}

let lastTouch = 0;
// Extends the session's idle-timeout window; called on user activity.
export function touchSession() {
  if (typeof window === "undefined") return;
  const now = Date.now();
  if (now - lastTouch < TOUCH_THROTTLE_MS) return;
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return;
  try {
    const s = JSON.parse(raw) as Session;
    if (!s.expiresAt || s.expiresAt < now) return;
    lastTouch = now;
    s.expiresAt = now + IDLE_TIMEOUT_MS;
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  } catch {
    // ignore malformed session
  }
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

export async function login(email: string, password: string): Promise<Session> {
  const lockoutMs = getLoginLockoutMs(email);
  if (lockoutMs > 0) {
    throw new Error(`Too many attempts. Try again in ${Math.ceil(lockoutMs / 1000)}s.`);
  }
  const u = await db.users.where("email").equals(email.trim().toLowerCase()).first();
  if (!u) {
    recordFailedLogin(email);
    throw new Error("Invalid credentials");
  }
  const ok = await verifyPassword(password, u.passwordHash);
  if (!ok) {
    recordFailedLogin(email);
    throw new Error("Invalid credentials");
  }
  clearFailedLogins(email);
  const s: Session = {
    userId: u.id,
    email: u.email,
    fullName: u.fullName,
    role: u.role,
    branchId: u.branchId,
    financeTier: u.financeTier,
    expiresAt: Date.now() + IDLE_TIMEOUT_MS,
  };
  setSession(s);
  return s;
}

export function logout() {
  setSession(null);
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const u = await db.users.get(userId);
  if (!u) throw new Error("User not found");
  const ok = await verifyPassword(currentPassword, u.passwordHash);
  if (!ok) throw new Error("Current password is incorrect");
  if (newPassword.length < 8) throw new Error("Password must be at least 8 characters");
  await db.users.update(userId, { passwordHash: await hashPassword(newPassword) });
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

export async function consumePasswordResetToken(token: string, newPassword: string): Promise<void> {
  const rec = await db.passwordResetTokens.get(token.trim());
  if (!rec || rec.used || rec.expiresAt < Date.now()) {
    throw new Error("This reset code is invalid or has expired");
  }
  if (newPassword.length < 8) throw new Error("Password must be at least 8 characters");
  // Hash outside the transaction — WebCrypto isn't Dexie-tracked, so awaiting
  // it mid-transaction risks the transaction auto-committing early.
  const passwordHash = await hashPassword(newPassword);
  await db.transaction("rw", [db.users, db.passwordResetTokens], async () => {
    await db.users.update(rec.userId, { passwordHash });
    await db.passwordResetTokens.update(token, { used: true });
  });
}

// ---- React hook ----
export function useSession() {
  const [session, setState] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setState(getSession());
    setReady(true);
    const on = () => setState(getSession());
    window.addEventListener("mychurch:session", on);
    window.addEventListener("storage", on);

    // Idle timeout: any activity extends the session; a periodic check
    // notices expiry even if the tab sits untouched.
    const onActivity = () => touchSession();
    window.addEventListener("pointerdown", onActivity);
    window.addEventListener("keydown", onActivity);
    const expiryCheck = window.setInterval(on, 10_000);

    return () => {
      window.removeEventListener("mychurch:session", on);
      window.removeEventListener("storage", on);
      window.removeEventListener("pointerdown", onActivity);
      window.removeEventListener("keydown", onActivity);
      window.clearInterval(expiryCheck);
    };
  }, []);

  const signOut = useCallback(() => logout(), []);
  return { session, ready, signOut };
}

export function canManageUsers(role: Role) {
  return role === "admin";
}
export function canEditCell(role: Role, cellLeaderId: string | undefined, userId: string) {
  if (role === "admin" || role === "pastor") return true;
  return role === "cell_leader" && cellLeaderId === userId;
}
export function canEditClass(role: Role, facilitatorId: string | undefined, userId: string) {
  if (role === "admin" || role === "pastor") return true;
  return role === "cell_leader" && facilitatorId === userId;
}
export function canAccessGivings(role: Role) {
  return role === "admin" || role === "pastor" || role === "treasurer";
}
// View access: admin/pastor manage every department; a "leader" needs to see
// this page too, since it's the only place their own assignment shows up.
export function canAccessDepartments(role: Role) {
  return role === "admin" || role === "pastor" || role === "leader";
}
export function canManageDepartments(role: Role) {
  return role === "admin" || role === "pastor";
}
export function canManageEvents(role: Role) {
  return role === "admin" || role === "pastor";
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
export function canAccessPartners(role: Role, financeTier?: "A") {
  return (
    role === "admin" ||
    role === "pastor" ||
    role === "treasurer" ||
    isTierAFinanceLeader(role, financeTier)
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
