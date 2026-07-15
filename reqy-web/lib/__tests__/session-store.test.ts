import { describe, it, expect, vi, beforeEach } from "vitest";

const { authSignup, authLogin, authLogout, authMe } = vi.hoisted(() => ({
  authSignup: vi.fn(),
  authLogin: vi.fn(),
  authLogout: vi.fn(),
  authMe: vi.fn(),
}));
vi.mock("@/lib/auth-client", () => ({ authSignup, authLogin, authLogout, authMe }));

import { useSessionStore } from "@/lib/session-store";

beforeEach(() => {
  localStorage.clear();
  authSignup.mockReset();
  authLogin.mockReset();
  authLogout.mockReset();
  authMe.mockReset();
  useSessionStore.setState({ user: null, token: null, status: "unauthenticated" });
});

describe("session-store", () => {
  it("login sets user+token, persists token, marks authenticated", async () => {
    authLogin.mockResolvedValue({ user: { id: "u1", email: "a@b.io", name: "A" }, token: "tok" });
    const user = await useSessionStore.getState().login("a@b.io", "supersecret");
    expect(user.email).toBe("a@b.io");
    expect(useSessionStore.getState().token).toBe("tok");
    expect(useSessionStore.getState().status).toBe("authenticated");
    expect(localStorage.getItem("reqly.auth.token")).toBe("tok");
  });

  it("signup sets user+token and marks authenticated", async () => {
    authSignup.mockResolvedValue({ user: { id: "u1", email: "a@b.io", name: "" }, token: "tok" });
    await useSessionStore.getState().signup("a@b.io", "supersecret", "A");
    expect(useSessionStore.getState().token).toBe("tok");
    expect(useSessionStore.getState().status).toBe("authenticated");
  });

  it("restore with a token validates via /me", async () => {
    useSessionStore.setState({ token: "tok", status: "loading" });
    authMe.mockResolvedValue({ id: "u1", email: "a@b.io", name: "A" });
    await useSessionStore.getState().restore();
    expect(authMe).toHaveBeenCalledWith("tok");
    expect(useSessionStore.getState().user?.email).toBe("a@b.io");
    expect(useSessionStore.getState().status).toBe("authenticated");
  });

  it("restore with an invalid token clears the session", async () => {
    useSessionStore.setState({ token: "bad", status: "loading" });
    authMe.mockRejectedValue(new Error("401"));
    await useSessionStore.getState().restore();
    expect(useSessionStore.getState().token).toBeNull();
    expect(useSessionStore.getState().status).toBe("unauthenticated");
    expect(localStorage.getItem("reqly.auth.token")).toBeNull();
  });

  it("restore without a token sets unauthenticated", async () => {
    useSessionStore.setState({ token: null });
    await useSessionStore.getState().restore();
    expect(useSessionStore.getState().status).toBe("unauthenticated");
    expect(authMe).not.toHaveBeenCalled();
  });

  it("logout calls authLogout and clears the token", async () => {
    useSessionStore.setState({
      token: "tok",
      user: { id: "u1", email: "a@b.io", name: "A" },
      status: "authenticated",
    });
    authLogout.mockResolvedValue(undefined);
    await useSessionStore.getState().logout();
    expect(authLogout).toHaveBeenCalledWith("tok");
    expect(useSessionStore.getState().token).toBeNull();
    expect(localStorage.getItem("reqly.auth.token")).toBeNull();
  });
});
