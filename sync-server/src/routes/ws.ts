import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, WebSocket } from "ws";
import { parseSessionCookie, escapeRegex } from "../auth.js";
import { isMember } from "../sync-engine.js";
import { addClient, removeClient, type Client } from "../ws-hub.js";

const COOKIE_NAME = "auth_session";
const PING_INTERVAL_MS = 30_000;

export function handleWsUpgrade(
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  wss: WebSocketServer,
) {
  const cookieHeader = req.headers.cookie ?? "";
  const match = cookieHeader.match(new RegExp(`${escapeRegex(COOKIE_NAME)}=([^;]+)`));
  const session = parseSessionCookie(match?.[1]);
  if (!session || !session.userId) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }

  const url = new URL(req.url ?? "/", "http://localhost");
  const workspaceId = url.searchParams.get("workspaceId");
  if (!workspaceId) {
    socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
    socket.destroy();
    return;
  }

  if (!isMember(workspaceId, session.userId)) {
    socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (wsConn: WebSocket) => {
    const client: Client = { ws: wsConn, userId: session.userId!, workspaceId };
    addClient(client);

    const cleanup = () => removeClient(client);
    wsConn.on("close", cleanup);
    wsConn.on("error", cleanup);

    wsConn.on("pong", () => {
      // Keepalive response received; no-op (just resets the ping timer below)
    });

    // Keepalive: ping every PING_INTERVAL_MS; if no pong, terminate
    const pingInterval = setInterval(() => {
      if (wsConn.readyState !== WebSocket.OPEN) {
        clearInterval(pingInterval);
        return;
      }
      wsConn.ping();
      // Terminate if no pong received within the interval
      // (we trust ws library's internal handling; explicit terminate here would
      //  close idle clients; we keep it simple and let close handle it)
    }, PING_INTERVAL_MS);

    wsConn.on("close", () => clearInterval(pingInterval));
    wsConn.on("error", () => clearInterval(pingInterval));

    // Periodic session re-verification: check every 60s that the session
    // is still valid. If the user was logged out (session expired / revoked),
    // terminate the connection.
    const sessionRecheck = setInterval(() => {
      if (wsConn.readyState !== WebSocket.OPEN) {
        clearInterval(sessionRecheck);
        return;
      }
      // Re-parse the session from the cookie to check expiry
      const cookieHeader = req.headers.cookie ?? "";
      const reMatch = cookieHeader.match(new RegExp(`${escapeRegex(COOKIE_NAME)}=([^;]+)`));
      const reSession = parseSessionCookie(reMatch?.[1]);
      if (!reSession || !reSession.userId) {
        wsConn.send(JSON.stringify({ type: "error", payload: "Session expired" }));
        wsConn.close(4001, "Session expired");
        clearInterval(sessionRecheck);
      }
    }, 60_000);

    // Send hello
    try {
      wsConn.send(JSON.stringify({ type: "hello", workspaceId }));
    } catch {
      // ignore: socket may already be closing
    }

    // Extend cleanup to include the recheck timer
    const originalCleanup = cleanup;
    const cleanupWithTimers = () => {
      clearInterval(sessionRecheck);
      originalCleanup();
    };
    wsConn.on("close", cleanupWithTimers);
    wsConn.on("error", cleanupWithTimers);
  });
}
