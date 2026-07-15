import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/env", () => ({ getPublicEnv: vi.fn() }));

import { authSignup, authLogin, authLogout, authMe } from "@/lib/auth-client";
import { getPublicEnv } from "@/lib/env";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

beforeEach(() => {
  fetchMock.mockReset();
  vi.mocked(getPublicEnv).mockReturnValue({ NEXT_PUBLIC_SYNC_URL: "https://sync.example.com/" });
});

describe("auth-client", () => {
  it("signup POSTs to /api/auth/signup and returns user+token", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ user: { id: "u1", email: "a@b.io", name: "A" }, token: "tok" }),
    });
    const res = await authSignup("a@b.io", "supersecret", "A");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://sync.example.com/api/auth/signup",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ email: "a@b.io", password: "supersecret", name: "A" }),
      }),
    );
    expect(res.user.email).toBe("a@b.io");
    expect(res.token).toBe("tok");
  });

  it("login returns user+token", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ user: { id: "u1", email: "a@b.io", name: "" }, token: "tok" }),
    });
    const res = await authLogin("a@b.io", "supersecret");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://sync.example.com/api/auth/login",
      expect.objectContaining({ method: "POST" }),
    );
    expect(res.token).toBe("tok");
  });

  it("throws with server error message on non-ok signup", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: "exists" }),
    });
    await expect(authSignup("a@b.io", "supersecret")).rejects.toThrow("exists");
  });

  it("me sends Bearer and returns the user", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ id: "u1", email: "a@b.io", name: "A" }),
    });
    const user = await authMe("tok");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://sync.example.com/api/auth/me",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer tok" }),
      }),
    );
    expect(user.email).toBe("a@b.io");
  });

  it("me throws on 401", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });
    await expect(authMe("tok")).rejects.toThrow();
  });

  it("logout POSTs with Bearer", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    await authLogout("tok");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://sync.example.com/api/auth/logout",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer tok" }),
      }),
    );
  });
});
