import { create } from "zustand";
import { authSignup, authLogin, authLogout, authMe, type AuthUser } from "@/lib/auth-client";

const TOKEN_KEY = "reqly.auth.token";

export type SessionStatus = "idle" | "loading" | "authenticated" | "unauthenticated";

interface SessionState {
  user: AuthUser | null;
  token: string | null;
  status: SessionStatus;
  /** Validate a persisted token on app start; clears it if invalid. */
  restore: () => Promise<void>;
  login: (email: string, password: string) => Promise<AuthUser>;
  signup: (email: string, password: string, name?: string) => Promise<AuthUser>;
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
    const { user, token } = await authSignup(email, password, name);
    saveToken(token);
    set({ user, token, status: "authenticated" });
    return user;
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
