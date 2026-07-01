export const dynamic = 'force-dynamic';
export async function generateStaticParams() {
  return [{ requestId: 'placeholder' }];
}
/**
 * Phase 5.3 — Chat history API routes
 *
 * GET    /api/ai/chat/[requestId]      → list messages
 * POST   /api/ai/chat/[requestId]      → append a message
 * DELETE /api/ai/chat/[requestId]      → clear all messages for this request
 *                                         (or one message if ?id=<msgId> is provided)
 *
 * Auth: requires a Supabase access token in the Authorization header.
 * RLS ensures users only see/modify their own messages.
 */
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseClientWithToken } from "@/app/lib/supabase-server";

function getAuthError() {
  return NextResponse.json({ error: "Missing or invalid Authorization header" }, { status: 401 });
}

function getSupabaseFromRequest(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  return createSupabaseClientWithToken(token);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  const sb = getSupabaseFromRequest(req);
  if (!sb) return getAuthError();
  const { requestId } = await params;
  if (!requestId) {
    return NextResponse.json({ error: "Missing requestId" }, { status: 400 });
  }

  const { data, error } = await sb
    .from("chat_history")
    .select("id, request_id, role, content, metadata, created_at")
    .eq("request_id", requestId)
    .order("created_at", { ascending: true })
    .limit(500);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ messages: data ?? [] });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  const sb = getSupabaseFromRequest(req);
  if (!sb) return getAuthError();
  const { requestId } = await params;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { role, content, metadata } = body ?? {};
  if (!requestId || !role || !content) {
    return NextResponse.json(
      { error: "Missing required fields: requestId, role, content" },
      { status: 400 }
    );
  }
  if (role !== "user" && role !== "assistant") {
    return NextResponse.json(
      { error: "role must be 'user' or 'assistant'" },
      { status: 400 }
    );
  }
  if (typeof content !== "string") {
    return NextResponse.json({ error: "content must be a string" }, { status: 400 });
  }

  // Resolve user_id from the auth session (RLS will enforce the row belongs to them).
  const { data: userData, error: userErr } = await sb.auth.getUser();
  if (userErr || !userData?.user?.id) {
    return NextResponse.json({ error: "Authentication failed" }, { status: 401 });
  }

  const { data, error } = await sb
    .from("chat_history")
    .insert({
      user_id: userData.user.id,
      request_id: requestId,
      role,
      content,
      metadata: metadata ?? {},
    })
    .select("id, request_id, role, content, metadata, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ message: data }, { status: 201 });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  const sb = getSupabaseFromRequest(req);
  if (!sb) return getAuthError();
  const { requestId } = await params;

  const url = new URL(req.url);
  const singleId = url.searchParams.get("id");

  let query = sb.from("chat_history").delete().eq("request_id", requestId);
  if (singleId) {
    query = query.eq("id", singleId);
  }
  const { error, count } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ deleted: count ?? 0 });
}
