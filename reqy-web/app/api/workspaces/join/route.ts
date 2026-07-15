export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getPublicEnv } from "@/lib/env";
import { proxyAuthHeaders } from "@/lib/proxy-auth";

const SYNC_URL = getPublicEnv().NEXT_PUBLIC_SYNC_URL || "";

export async function POST(request: NextRequest) {
  if (!SYNC_URL) {
    return NextResponse.json({ error: "Sync server not configured" }, { status: 500 });
  }

  const body = await request.text();
  try {
    const res = await fetch(`${SYNC_URL}/api/memberships`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: request.headers.get("cookie") || "",
        ...proxyAuthHeaders(),
      },
      body,
      cache: "no-store",
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: `Sync server unreachable at ${SYNC_URL}` }, { status: 502 });
  }
}
