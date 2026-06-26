/**
 * Tests for useChatHistory hook.
 * Mocks the Supabase browser client and verifies state transitions.
 */
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// Provide a stub `window` so embedding-cache-style browser checks would pass
Object.defineProperty(globalThis, "window", { value: globalThis, writable: true });

// In-memory store for the fake Supabase client
const store: { rows: any[] } = { rows: [] };

function fakeQuery() {
  const q: any = {
    select: vi.fn(() => q),
    insert: vi.fn((values: any) => {
      const rows = Array.isArray(values) ? values : [values];
      rows.forEach((r) => store.rows.push({ id: `id-${store.rows.length}`, ...r, created_at: new Date().toISOString() }));
      return {
        select: () => ({
          single: () => ({
            data: rows[rows.length - 1] ?? null,
            error: null,
          }),
        }),
      };
    }),
    update: vi.fn(() => q),
    delete: vi.fn(() => q),
    eq: vi.fn(() => q),
    order: vi.fn(() => q),
    limit: vi.fn(() => {
      return Promise.resolve({ data: store.rows, error: null });
    }),
  };
  return q;
}

vi.mock("@/lib/supabase-client", () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      getUser: () =>
        Promise.resolve({ data: { user: { id: "user-1" } }, error: null }),
    },
    from: () => fakeQuery(),
  }),
}));

import { useChatHistory, computeRequestId } from "@/hooks/use-chat-history";

describe("computeRequestId", () => {
  it("uppercases method and lowercases url", () => {
    expect(computeRequestId("get", "HTTPS://API.Example.COM/users")).toBe(
      "GET::https://api.example.com/users"
    );
  });
  it("defaults to GET when method is empty", () => {
    expect(computeRequestId("", "/foo")).toBe("GET::/foo");
  });
  it("returns empty url when url is empty", () => {
    expect(computeRequestId("POST", "")).toBe("POST::");
  });
});

describe("useChatHistory", () => {
  beforeEach(() => {
    store.rows.length = 0;
  });

  it("fetches existing history on mount", async () => {
    store.rows.push({
      id: "x1",
      request_id: "req-1",
      role: "user",
      content: "hi",
      metadata: {},
      created_at: "2024-01-01T00:00:00Z",
    });

    const { result } = renderHook(() => useChatHistory("req-1"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].content).toBe("hi");
    expect(result.current.authenticated).toBe(true);
  });

  it("appends a new message", async () => {
    const { result } = renderHook(() => useChatHistory("req-2"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.append("user", "hello");
    });

    expect(result.current.messages.length).toBeGreaterThanOrEqual(1);
    expect(result.current.messages[result.current.messages.length - 1].content).toBe("hello");
    expect(result.current.messages[result.current.messages.length - 1].role).toBe("user");
  });

  it("clear() removes all messages for the request", async () => {
    store.rows.push({
      id: "y1",
      request_id: "req-3",
      role: "user",
      content: "msg",
      metadata: {},
      created_at: new Date().toISOString(),
    });

    const { result } = renderHook(() => useChatHistory("req-3"));
    await waitFor(() => expect(result.current.messages.length).toBe(1));

    await act(async () => {
      await result.current.clear();
    });

    expect(result.current.messages).toEqual([]);
  });

  it("returns empty messages when requestId is null", () => {
    const { result } = renderHook(() => useChatHistory(null));
    expect(result.current.messages).toEqual([]);
    expect(result.current.authenticated).toBe(false);
  });

  it("refetch triggers a re-fetch", async () => {
    const { result } = renderHook(() => useChatHistory("req-4"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.messages).toHaveLength(0);

    store.rows.push({
      id: "z1",
      request_id: "req-4",
      role: "assistant",
      content: "after-refetch",
      metadata: {},
      created_at: new Date().toISOString(),
    });

    await act(async () => {
      await result.current.refetch();
    });

    expect(result.current.messages.length).toBeGreaterThanOrEqual(1);
  });
});
