export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getPublicEnv } from "@/lib/env";
import { proxyAuthHeaders } from "@/lib/proxy-auth";

const SYNC_URL = getPublicEnv().NEXT_PUBLIC_SYNC_URL || "";

function getSyncPath(request: NextRequest): string {
  const segments = request.nextUrl.pathname.split("/").filter(Boolean);
  const id = segments[2] ?? "";
  const rest = segments.slice(3).join("/");
  return `/workspaces/${id}${rest ? "/" + rest : ""}`;
}

async function proxyJson(req: NextRequest): Promise<NextResponse> {
  if (!SYNC_URL) {
    return NextResponse.json({ error: "Sync server not configured" }, { status: 500 });
  }

  const syncPath = getSyncPath(req);
  const target = `${SYNC_URL}/api/sync${syncPath}${req.nextUrl.search}`;
  const body = req.method !== "GET" && req.method !== "HEAD" ? await req.text() : undefined;

  const res = await fetch(target, {
    method: req.method,
    headers: {
      "Content-Type": "application/json",
      ...proxyAuthHeaders(),
    },
    body,
    cache: "no-store",
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function POST(request: NextRequest) {
  return proxyJson(request);
}
