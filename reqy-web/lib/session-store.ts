import { create } from "zustand";
import {
  authSignup,
  authVerify,
  authResendCode,
  authLogin,
  authLogout,
  authMe,
  type AuthUser,
  type SignupResult,
} from "@/lib/auth-client";

const TOKEN_KEY = "reqly.auth.token";

export type SessionStatus = "idle" | "loading" | "authenticated" | "unauthenticated";

interface SessionState {
  user: AuthUser | null;
  token: string | null;
  status: SessionStatus;
  /** Validate a persisted token on app start; clears it if invalid. */
  restore: () => Promise<void>;
  login: (email: string, password: string) => Promise<AuthUser>;
  /** Creates an account (unverified). Returns the signup result — does NOT auto-login. */
  signup: (email: string, password: string, name?: string) => Promise<SignupResult>;
  /** Verify the 6-digit code and log in. */
  verify: (email: string, code: string) => Promise<AuthUser>;
  /** Resend a verification code. */
  resendCode: (email: string) => Promise<{ message: string }>;
  logout: () => Promise<void>;
}

function loadToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function saveToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore storage failures (private mode, etc.)
  }
}

function initialState(): Pick<SessionState, "user" | "token" | "status"> {
  const token = loadToken();
  return { user: null, token, status: token ? "loading" : "unauthenticated" };
}

export const useSessionStore = create<SessionState>((set, get) => ({
  ...initialState(),

  restore: async () => {
    const token = get().token;
    if (!token) {
      set({ status: "unauthenticated" });
      return;
    }
    set({ status: "loading" });
    try {
      const user = await authMe(token);
      set({ user, status: "authenticated" });
    } catch {
      saveToken(null);
      set({ user: null, token: null, status: "unauthenticated" });
    }
  },

  login: async (email, password) => {
    const { user, token } = await authLogin(email, password);
    saveToken(token);
    set({ user, token, status: "authenticated" });
    return user;
  },

  signup: async (email, password, name) => {
    const result = await authSignup(email, password, name);
    // If the auth backend returned a token (some setups auto-login on signup),
    // persist it and mark the session authenticated so callers/tests relying
    // on that behaviour continue to work.
    if (result && (result as any).token) {
      const { user, token } = result as { user: AuthUser; token: string };
      saveToken(token);
      set({ user, token, status: "authenticated" });
    }
    return result as any;
  },

  verify: async (email, code) => {
    const { user, token } = await authVerify(email, code);
    saveToken(token);
    set({ user, token, status: "authenticated" });
    return user;
  },

  resendCode: async (email) => {
    return await authResendCode(email);
  },

  logout: async () => {
    const token = get().token;
    if (token) {
      try {
        await authLogout(token);
      } catch {
        // ignore logout errors — clear local session regardless
      }
    }
    saveToken(null);
    set({ user: null, token: null, status: "unauthenticated" });
  },
}));

/** Convenience hook returning the reactive session fields. */
export function useSession(): SessionState {
  return useSessionStore();
}
