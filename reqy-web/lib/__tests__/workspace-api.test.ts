import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/tauri", () => ({ isTauriAvailable: vi.fn() }));
vi.mock("@/lib/env", () => ({ getPublicEnv: vi.fn() }));
vi.mock("@/lib/proxy-auth", () => ({ proxyAuthHeaders: vi.fn() }));

import { workspaceFetch } from "@/lib/workspace-api";
import { isTauriAvailable } from "@/lib/tauri";
import { getPublicEnv } from "@/lib/env";
import { proxyAuthHeaders } from "@/lib/proxy-auth";

const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
vi.stubGlobal("fetch", fetchMock);

beforeEach(() => {
  fetchMock.mockClear();
  vi.mocked(isTauriAvailable).mockReset();
  vi.mocked(getPublicEnv).mockReset();
  vi.mocked(proxyAuthHeaders).mockReset();
});

describe("workspaceFetch", () => {
  it("web: calls same-origin /api/workspaces without proxy auth", async () => {
    vi.mocked(isTauriAvailable).mockReturnValue(false);
    await workspaceFetch("/api/workspaces", { method: "GET" });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/workspaces",
      expect.objectContaining({ method: "GET" }),
    );
    // Desktop-only proxy auth must NOT be applied on the web build.
    expect(vi.mocked(proxyAuthHeaders)).not.toHaveBeenCalled();
  });

  it("desktop: prefixes SYNC_URL and adds proxy auth headers", async () => {
    vi.mocked(isTauriAvailable).mockReturnValue(true);
    vi.mocked(getPublicEnv).mockReturnValue({
      NEXT_PUBLIC_SYNC_URL: "https://sync.example.com/",
    } as never);
    vi.mocked(proxyAuthHeaders).mockReturnValue({ Authorization: "Bearer tok" });
    await workspaceFetch("/api/workspaces", { method: "GET" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://sync.example.com/api/workspaces",
      expect.objectContaining({ method: "GET" }),
    );
    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.get("authorization")).toBe("Bearer tok");
    expect(headers.get("content-type")).toBe("application/json");
  });

  it("maps join asymmetrically: desktop -> /api/workspaces/invitations/accept, web -> /api/workspaces/join", async () => {
    vi.mocked(isTauriAvailable).mockReturnValue(true);
    vi.mocked(getPublicEnv).mockReturnValue({
      NEXT_PUBLIC_SYNC_URL: "https://sync.example.com",
    } as never);
    vi.mocked(proxyAuthHeaders).mockReturnValue({});
    await workspaceFetch(
      "/api/workspaces/invitations/accept",
      { method: "POST" },
      "/api/workspaces/join",
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://sync.example.com/api/workspaces/invitations/accept",
      expect.objectContaining({ method: "POST" }),
    );

    fetchMock.mockClear();
    vi.mocked(isTauriAvailable).mockReturnValue(false);
    await workspaceFetch(
      "/api/workspaces/invitations/accept",
      { method: "POST" },
      "/api/workspaces/join",
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/workspaces/join",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
