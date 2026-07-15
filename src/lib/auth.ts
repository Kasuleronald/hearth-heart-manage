import { useEffect, useState, useCallback } from "react";
import { db, uid, type Role, type User } from "./db";

const SESSION_KEY = "mychurch.session";
const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const TOUCH_THROTTLE_MS = 60 * 1000; // don't rewrite storage more than once a minute

export interface Session {
  userId: string;
  username: string;
  fullName: string;
  role: Role;
  expiresAt: number;
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

export function getLoginLockoutMs(username: string): number {
  const rec = readAttempts()[username.trim().toLowerCase()];
  if (!rec?.lockedUntil) return 0;
  return Math.max(0, rec.lockedUntil - Date.now());
}

function recordFailedLogin(username: string) {
  const key = username.trim().toLowerCase();
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

function clearFailedLogins(username: string) {
  const key = username.trim().toLowerCase();
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
  username: string;
  password: string;
  fullName: string;
  role: Role;
}): Promise<User> {
  const username = input.username.trim().toLowerCase();
  const existing = await db.users.where("username").equals(username).first();
  if (existing) throw new Error("Username already exists");
  const user: User = {
    id: uid(),
    username,
    fullName: input.fullName.trim(),
    role: input.role,
    passwordHash: await hashPassword(input.password),
    createdAt: Date.now(),
  };
  await db.users.add(user);
  return user;
}

export async function login(username: string, password: string): Promise<Session> {
  const lockoutMs = getLoginLockoutMs(username);
  if (lockoutMs > 0) {
    throw new Error(`Too many attempts. Try again in ${Math.ceil(lockoutMs / 1000)}s.`);
  }
  const u = await db.users.where("username").equals(username.trim().toLowerCase()).first();
  if (!u) {
    recordFailedLogin(username);
    throw new Error("Invalid credentials");
  }
  const ok = await verifyPassword(password, u.passwordHash);
  if (!ok) {
    recordFailedLogin(username);
    throw new Error("Invalid credentials");
  }
  clearFailedLogins(username);
  const s: Session = {
    userId: u.id,
    username: u.username,
    fullName: u.fullName,
    role: u.role,
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
  return role === "admin" || role === "pastor";
}
