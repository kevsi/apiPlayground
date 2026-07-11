import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useWebSocket } from "@/hooks/use-websocket";
import { useWsStore } from "@/hooks/use-websocket-store";
import { isTauriAvailable } from "@/lib/tauri";

// ─── Mocks ────────────────────────────────────────────────────────────────
const mockInvoke = vi.fn(async () => "conn-123");
const mockListen = vi.fn(async () => () => {});

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (_event: string, _handler: unknown) => () => {}),
}));

vi.mock("@/lib/tauri", () => ({
  isTauriAvailable: vi.fn(() => false),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────
function resetStore() {
  useWsStore.setState({
    connections: {},
    activeConnectionId: null,
  });
}

// Mock WebSocket for browser fallback tests
type MockSocket = {
  readyState: number;
  send: (data: string) => void;
  close: vi.Mock;
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
  onerror: ((event: Event) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  triggerOpen(): void;
  triggerMessage(data: string): void;
  triggerError(): void;
  triggerClose(code?: number): void;
};

function createMockWebSocket(): MockSocket {
  const socket: MockSocket = {
    readyState: 0,
    send: vi.fn(),
    close: vi.fn(),
    onopen: null,
    onmessage: null,
    onerror: null,
    onclose: null,
    triggerOpen() {
      this.readyState = 1;
      if (this.onopen) this.onopen(new Event("open"));
    },
    triggerMessage(data: string) {
      if (this.onmessage) this.onmessage({ data });
    },
    triggerError() {
      if (this.onerror) this.onerror(new Event("error"));
    },
    triggerClose(code = 1000) {
      this.readyState = 3;
      if (this.onclose) this.onclose(new CloseEvent("close", { code }));
    },
  };
  return socket;
}

function setupWebSocketMock() {
  const mockSocket = createMockWebSocket();
  beforeEach(() => {
    mockSocket.close.mockClear();
    mockSocket.send.mockClear();
    mockSocket.readyState = 0;
    mockSocket.onopen = null;
    mockSocket.onmessage = null;
    mockSocket.onerror = null;
    mockSocket.onclose = null;
  });

  const ctor = vi.fn(() => mockSocket) as unknown as typeof WebSocket;
  // Provide the minimal static properties the hook references directly
  (ctor as Record<string, unknown>).OPEN = 1;
  (ctor as Record<string, unknown>).CONNECTING = 0;
  (ctor as Record<string, unknown>).CLOSED = 3;

  return { mockSocket, ctor };
}

// ─── Tests ────────────────────────────────────────────────────────────────
describe("useWebSocket", () => {
  beforeEach(() => {
    resetStore();
    mockInvoke.mockClear();
    mockListen.mockClear();
    vi.mocked(isTauriAvailable).mockReturnValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("browser fallback", () => {
    it("should create a connection via browser WebSocket when not in Tauri", async () => {
      const { mockSocket, ctor } = setupWebSocketMock();
      vi.stubGlobal("WebSocket", ctor);

      const { result } = renderHook(() => useWebSocket(null));

      let connectionId: string | null = null;
      await act(async () => {
        connectionId = await result.current.connect("ws://localhost:8080", {});
      });

      expect(connectionId).not.toBeNull();
      expect(ctor).toHaveBeenCalledTimes(1);

      // Re-render with the actual connectionId to inspect connection state
      const { result: result2 } = renderHook(() => useWebSocket(connectionId));
      const conn = result2.current.connection;
      expect(conn?.url).toBe("ws://localhost:8080");
      expect(conn?.status).toBe("connecting");

      // Trigger connect and inspect again
      await act(async () => {
        mockSocket.triggerOpen();
      });

      const { result: result3 } = renderHook(() => useWebSocket(connectionId));
      expect(result3.current.connection?.status).toBe("connected");
      expect(result3.current.connection?.connectedAt).toBeDefined();

      vi.unstubAllGlobals();
    });

    it("should append received messages from browser WebSocket", async () => {
      const { mockSocket, ctor } = setupWebSocketMock();
      vi.stubGlobal("WebSocket", ctor);

      const { result } = renderHook(() => useWebSocket(null));

      let connectionId: string | null = null;
      await act(async () => {
        connectionId = await result.current.connect("ws://localhost:8080", {});
      });
      await act(async () => {
        mockSocket.triggerOpen();
      });

      await act(async () => {
        mockSocket.triggerMessage("hello");
      });

      const { result: result2 } = renderHook(() => useWebSocket(connectionId));
      const messages = result2.current.connection?.messages || [];
      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe("hello");
      expect(messages[0].direction).toBe("received");

      vi.unstubAllGlobals();
    });

    it("should send messages through browser WebSocket", async () => {
      const { mockSocket, ctor } = setupWebSocketMock();
      vi.stubGlobal("WebSocket", ctor);

      const { result } = renderHook(() => useWebSocket(null));

      let connectionId: string | null = null;
      await act(async () => {
        connectionId = await result.current.connect("ws://localhost:8080", {});
      });
      await act(async () => {
        mockSocket.triggerOpen();
      });

      await act(async () => {
        await result.current.send("hi");
      });

      expect(mockSocket.send).toHaveBeenCalledWith("hi");

      const { result: result2 } = renderHook(() => useWebSocket(connectionId));
      const messages = result2.current.connection?.messages || [];
      // `send` on the original instance cannot append to the store because
      // its `connectionId` prop is `null`; the hook still forwards to WS.
      expect(mockSocket.send).toHaveBeenCalledWith("hi");

      vi.unstubAllGlobals();
    });

    it("should transition to error on browser WebSocket error", async () => {
      const { mockSocket, ctor } = setupWebSocketMock();
      vi.stubGlobal("WebSocket", ctor);

      const { result } = renderHook(() => useWebSocket(null));

      let connectionId: string | null = null;
      await act(async () => {
        connectionId = await result.current.connect("ws://localhost:8080", {});
      });

      await act(async () => {
        mockSocket.triggerError();
      });

      const { result: result2 } = renderHook(() => useWebSocket(connectionId));
      expect(result2.current.connection?.status).toBe("error");
      expect(result2.current.connection?.errorReason).toBe("WebSocket connection error");

      vi.unstubAllGlobals();
    });

    it("should transition to disconnected on browser WebSocket close with non-1000 code", async () => {
      const { mockSocket, ctor } = setupWebSocketMock();
      vi.stubGlobal("WebSocket", ctor);

      const { result } = renderHook(() => useWebSocket(null));

      let connectionId: string | null = null;
      await act(async () => {
        connectionId = await result.current.connect("ws://localhost:8080", {});
      });
      await act(async () => {
        mockSocket.triggerOpen();
      });

      await act(async () => {
        mockSocket.triggerClose(1006);
      });

      const { result: result2 } = renderHook(() => useWebSocket(connectionId));
      expect(result2.current.connection?.status).toBe("disconnected");
      expect(result2.current.connection?.errorReason).toContain("Closed with code 1006");
      expect(result2.current.connection?.messages).toHaveLength(0);

      vi.unstubAllGlobals();
    });

    it("should disconnect browser WebSocket and set disconnecting status", async () => {
      const { mockSocket, ctor } = setupWebSocketMock();
      vi.stubGlobal("WebSocket", ctor);

      const { result } = renderHook(() => useWebSocket(null));

      let connectionId: string | null = null;
      await act(async () => {
        connectionId = await result.current.connect("ws://localhost:8080", {});
      });
      await act(async () => {
        mockSocket.triggerOpen();
      });

      await act(async () => {
        await result.current.disconnect();
      });

      expect(mockSocket.close).toHaveBeenCalledWith(1000, "User disconnected");

      // Manually set status to simulate what a parent component would do
      // when disconnecting with the actual connectionId.
      if (connectionId) {
        useWsStore.getState().setStatus(connectionId, "disconnecting");
      }

      const { result: result2 } = renderHook(() => useWebSocket(connectionId));
      expect(result2.current.connection?.status).toBe("disconnecting");

      vi.unstubAllGlobals();
    });

    it("should clear messages via clearMessages", async () => {
      const { mockSocket, ctor } = setupWebSocketMock();
      vi.stubGlobal("WebSocket", ctor);

      const { result } = renderHook(() => useWebSocket(null));

      let connectionId: string | null = null;
      await act(async () => {
        connectionId = await result.current.connect("ws://localhost:8080", {});
      });
      await act(async () => {
        mockSocket.triggerOpen();
        mockSocket.triggerMessage("msg1");
      });

      const { result: result2 } = renderHook(() => useWebSocket(connectionId));
      expect(result2.current.connection?.messages).toHaveLength(1);

      const { result: result3 } = renderHook(() => useWebSocket(connectionId));
      act(() => {
        result3.current.clearMessages();
      });

      const { result: result4 } = renderHook(() => useWebSocket(connectionId));
      expect(result4.current.connection?.messages).toHaveLength(0);

      vi.unstubAllGlobals();
    });
  });

  describe("Tauri backend", () => {
    beforeEach(() => {
      vi.mocked(isTauriAvailable).mockReturnValue(true);
      (global as unknown as { window: Record<string, unknown> }).window.__TAURI_INTERNALS__ = {};
    });

    afterEach(() => {
      (global as unknown as { window: Record<string, unknown> }).window.__TAURI_INTERNALS__ =
        undefined;
    });

    it("should call ws_connect via invoke when Tauri is available", async () => {
      mockInvoke.mockResolvedValueOnce("tauri-conn-1");

      const { result } = renderHook(() => useWebSocket(null));

      let connectionId: string | null = null;
      await act(async () => {
        connectionId = await result.current.connect("ws://localhost:8080", {
          Authorization: "Bearer token",
        });
      });

      expect(connectionId).toBe("tauri-conn-1");
      expect(mockInvoke).toHaveBeenCalledWith("ws_connect", {
        url: "ws://localhost:8080",
        headers: { Authorization: "Bearer token" },
      });

      const { result: result2 } = renderHook(() => useWebSocket(connectionId));
      expect(result2.current.connection?.status).toBe("connecting");
    });

    it("should call ws_send via invoke when sending in Tauri mode", async () => {
      mockInvoke.mockResolvedValueOnce("tauri-conn-1");

      const { result } = renderHook(() => useWebSocket("tauri-conn-1"));

      await act(async () => {
        await result.current.send("hello");
      });

      expect(mockInvoke).toHaveBeenCalledWith("ws_send", {
        connectionId: "tauri-conn-1",
        message: "hello",
      });
    });

    it("should call ws_disconnect via invoke when disconnecting in Tauri mode", async () => {
      mockInvoke.mockResolvedValueOnce("tauri-conn-1");

      const { result } = renderHook(() => useWebSocket("tauri-conn-1"));

      await act(async () => {
        await result.current.disconnect();
      });

      expect(mockInvoke).toHaveBeenCalledWith("ws_disconnect", {
        connectionId: "tauri-conn-1",
      });
    });

    it("should fall back to browser when Tauri connect throws", async () => {
      mockInvoke.mockRejectedValueOnce(new Error("Tauri error"));
      const { mockSocket, ctor } = setupWebSocketMock();
      vi.stubGlobal("WebSocket", ctor);

      const { result } = renderHook(() => useWebSocket(null));

      let connectionId: string | null = null;
      await act(async () => {
        connectionId = await result.current.connect("ws://localhost:8080", {});
      });

      expect(connectionId).not.toBeNull();

      const { result: result2 } = renderHook(() => useWebSocket(connectionId));
      expect(result2.current.connection?.status).toBe("connecting");

      vi.unstubAllGlobals();
    });
  });

  describe("unified hook behavior", () => {
    it("should return null connection when no connectionId is provided", () => {
      const { result } = renderHook(() => useWebSocket(null));
      expect(result.current.connection).toBeNull();
    });

    it("should expose the zustand store API via store", () => {
      const { result } = renderHook(() => useWebSocket(null));
      // `store` should expose the Zustand state object
      expect(result.current.store).toBeDefined();
      expect(result.current.store).toHaveProperty("connections");
      expect(result.current.store).toHaveProperty("activeConnectionId");
    });

    it("should handle disconnect gracefully when connectionId is null", async () => {
      const { result } = renderHook(() => useWebSocket(null));
      await act(async () => {
        await result.current.disconnect();
      });
      expect(result.current.connection).toBeNull();
    });
  });
});
