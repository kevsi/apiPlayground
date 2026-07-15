export function passthroughSSE(upstreamRes: Response): Response {
  if (!upstreamRes.body) {
    return new Response("Upstream returned no body", { status: 502 });
  }
  return new Response(upstreamRes.body, {
    status: upstreamRes.status,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
