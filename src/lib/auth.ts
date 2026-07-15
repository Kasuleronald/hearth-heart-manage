import { useEffect, useState, useCallback } from "react";
import { db, uid, type Role, type User } from "./db";

const SESSION_KEY = "mychurch.session";

export interface Session {
  userId: string;
  username: string;
  fullName: string;
  role: Role;
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
    return raw ? (JSON.parse(raw) as Session) : null;
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
  const u = await db.users.where("username").equals(username.trim().toLowerCase()).first();
  if (!u) throw new Error("Invalid credentials");
  const ok = await verifyPassword(password, u.passwordHash);
  if (!ok) throw new Error("Invalid credentials");
  const s: Session = { userId: u.id, username: u.username, fullName: u.fullName, role: u.role };
  setSession(s);
  return s;
}

export function logout() {
  setSession(null);
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
    return () => {
      window.removeEventListener("mychurch:session", on);
      window.removeEventListener("storage", on);
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
