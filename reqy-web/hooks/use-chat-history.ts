/**
 * Phase 5.4 — useChatHistory hook
 *
 * Loads, appends, and clears chat history for a given request identifier.
 * Uses the browser Supabase client (RLS ensures user isolation). Falls back
 * gracefully if the user is anonymous (returns empty + a flag).
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-client";

export type ChatRole = "user" | "assistant";

export interface ChatMessageRecord {
  id: string;
  request_id: string;
  role: ChatRole;
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface UseChatHistoryResult {
  messages: ChatMessageRecord[];
  loading: boolean;
  error: string | null;
  authenticated: boolean;
  refetch: () => Promise<void>;
  append: (
    role: ChatRole,
    content: string,
    metadata?: Record<string, unknown>
  ) => Promise<ChatMessageRecord | null>;
  clear: (id?: string) => Promise<void>;
}

/**
 * @param requestId Identifier for the request. Pass null to skip fetching.
 * @param options.enabled Set false to disable fetching (e.g. during streaming).
 */
export function useChatHistory(
  requestId: string | null,
  options: { enabled?: boolean } = {}
): UseChatHistoryResult {
  const enabled = options.enabled !== false;
  const [messages, setMessages] = useState<ChatMessageRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const inflight = useRef(false);

  const refetch = useCallback(async () => {
    if (!requestId || !enabled) {
      setMessages([]);
      return;
    }
    if (inflight.current) return;
    inflight.current = true;
    setLoading(true);
    setError(null);
    try {
      const sb = getSupabaseBrowserClient();
      const { data: userData } = await sb.auth.getUser();
      if (!userData?.user?.id) {
        setAuthenticated(false);
        setMessages([]);
        return;
      }
      setAuthenticated(true);
      // Cast: supabase types are not generated in this project; runtime enforces schema.
      const { data, error: err } = await (sb.from("chat_history") as any)
        .select("id, request_id, role, content, metadata, created_at")
        .eq("request_id", requestId)
        .order("created_at", { ascending: true })
        .limit(500);
      if (err) throw err;
      setMessages((data as ChatMessageRecord[]) ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Erreur de chargement de l'historique");
    } finally {
      setLoading(false);
      inflight.current = false;
    }
  }, [requestId, enabled]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const append = useCallback(
    async (
      role: ChatRole,
      content: string,
      metadata: Record<string, unknown> = {}
    ): Promise<ChatMessageRecord | null> => {
      if (!requestId) return null;
      const sb = getSupabaseBrowserClient();
      const { data: userData } = await sb.auth.getUser();
      if (!userData?.user?.id) return null;
      const { data, error: err } = await (sb.from("chat_history") as any)
        .insert({
          user_id: userData.user.id,
          request_id: requestId,
          role,
          content,
          metadata,
        })
        .select("id, request_id, role, content, metadata, created_at")
        .single();
      if (err) {
        setError(err.message);
        return null;
      }
      const record = data as ChatMessageRecord;
      setMessages((prev) => [...prev, record]);
      return record;
    },
    [requestId]
  );

  const clear = useCallback(
    async (id?: string) => {
      if (!requestId) return;
      const sb = getSupabaseBrowserClient();
      const { data: userData } = await sb.auth.getUser();
      if (!userData?.user?.id) return;
      let query = (sb.from("chat_history") as any)
        .delete()
        .eq("request_id", requestId);
      if (id) query = query.eq("id", id);
      const { error: err } = await query;
      if (err) {
        setError(err.message);
        return;
      }
      setMessages((prev) => (id ? prev.filter((m) => m.id !== id) : []));
    },
    [requestId]
  );

  return { messages, loading, error, authenticated, refetch, append, clear };
}

/**
 * Compute a stable request identifier from method+url. Used as the chat
 * history partition key so each request has its own conversation thread.
 */
export function computeRequestId(method: string, url: string): string {
  const m = (method || "GET").toUpperCase();
  const cleaned = (url || "").trim().toLowerCase();
  return `${m}::${cleaned}`;
}
