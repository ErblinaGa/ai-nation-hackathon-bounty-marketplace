// Cookie-based mock session — we use cookie (not localStorage) for SSR compat
// so middleware.ts can read it on the server before the page renders.
import type { Session, User } from "../types";

const SESSION_COOKIE = "pt_session";
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Mock user accounts — extend to demo multi-user scenarios
export const MOCK_USERS: User[] = [
  { id: "user-1", name: "Alice Chen", email: "alice@example.com", avatarInitials: "AC" },
  { id: "user-2", name: "Bob Kumar", email: "bob@example.com", avatarInitials: "BK" },
  { id: "user-3", name: "Demo User", email: "demo@example.com", avatarInitials: "DU" },
];

export function findUser(email: string, _password: string): User | null {
  // Any password works for the demo — real auth would check against hashed pw
  return MOCK_USERS.find((u) => u.email === email) ?? null;
}

function parseCookies(): Record<string, string> {
  if (typeof document === "undefined") return {};
  return Object.fromEntries(
    document.cookie.split(";").map((c) => {
      const [k, ...v] = c.trim().split("=");
      return [k, decodeURIComponent(v.join("="))];
    })
  );
}

export function getSession(): Session | null {
  if (typeof document === "undefined") return null;
  const raw = parseCookies()[SESSION_COOKIE];
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as Session;
    if (new Date(session.expiresAt) < new Date()) {
      clearSession();
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function setSession(user: User): void {
  const session: Session = {
    userId: user.id,
    user,
    expiresAt: new Date(Date.now() + SESSION_DURATION_MS).toISOString(),
  };
  const maxAge = SESSION_DURATION_MS / 1000;
  // SameSite=Lax is sufficient for this demo
  document.cookie = `${SESSION_COOKIE}=${encodeURIComponent(JSON.stringify(session))}; max-age=${maxAge}; path=/; SameSite=Lax`;
}

export function clearSession(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${SESSION_COOKIE}=; max-age=0; path=/; SameSite=Lax`;
}
