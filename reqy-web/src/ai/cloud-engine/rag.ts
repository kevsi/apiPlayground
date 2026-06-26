/**
 * Phase 3.14 — RAG retrieval (hybrid: vector + BM25 full-text + RRF)
 *
 * - Embed query via Jina Embeddings
 * - Vector search via Postgres function `match_knowledge_chunks` (cosine)
 * - BM25 search via PostgREST textSearch (tsvector @@ query)
 * - Combine with Reciprocal Rank Fusion
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { embedSentences } from "./jina";

export interface RetrievedChunk {
  id: string;
  content: string;
  source: string;
  metadata: Record<string, unknown>;
  chunk_index: number;
  score: number; // RRF fused score (higher = more relevant)
  origin: "vector" | "bm25" | "hybrid";
}

export interface RetrieveOptions {
  supabase: SupabaseClient;
  jinaApiKey: string;
  /** Max results to return (default 5). */
  topK?: number;
  /** RRF constant k (default 60, standard). */
  rrfK?: number;
  /** Weight of vector results vs BM25 (default 0.5 = balanced). */
  vectorWeight?: number;
  /** Minimum similarity for vector matches (default 0.3). */
  vectorThreshold?: number;
  /** Optional filter by source identifier. */
  sourceFilter?: string;
}

interface VectorRow {
  id: string;
  content: string;
  source: string;
  metadata: Record<string, unknown>;
  chunk_index: number;
  similarity: number;
}

interface Bm25Row {
  id: string;
  content: string;
  source: string;
  metadata: Record<string, unknown>;
  chunk_index: number;
}

/**
 * Combine two ranked lists using Reciprocal Rank Fusion.
 * score(d) = sum over rankers of weight / (k + rank)
 */
function reciprocalRankFusion<T extends { id: string }>(
  vectorList: T[],
  bm25List: T[],
  opts: { k: number; vectorWeight: number; bm25Weight: number }
): Map<string, { row: T; score: number }> {
  const out = new Map<string, { row: T; score: number }>();

  const addRanked = (list: T[], weight: number) => {
    list.forEach((row, idx) => {
      const rank = idx + 1;
      const contribution = weight / (opts.k + rank);
      const existing = out.get(row.id);
      if (existing) {
        existing.score += contribution;
      } else {
        out.set(row.id, { row, score: contribution });
      }
    });
  };

  addRanked(vectorList, opts.vectorWeight);
  addRanked(bm25List, opts.bm25Weight);
  return out;
}

/**
 * Retrieve top-K knowledge chunks relevant to a query.
 * Combines vector similarity and BM25 full-text via RRF.
 */
export async function retrieveChunks(
  query: string,
  opts: RetrieveOptions
): Promise<RetrievedChunk[]> {
  const topK = opts.topK ?? 5;
  const k = opts.rrfK ?? 60;
  const vectorWeight = opts.vectorWeight ?? 0.5;
  const bm25Weight = 1 - vectorWeight;

  // 1. Embed query (always 1 sentence)
  const [queryVector] = await embedSentences([query], {
    apiKey: opts.jinaApiKey,
  });

  // 2. Vector search via RPC (requires match_knowledge_chunks function in DB)
  let vectorRows: VectorRow[] = [];
  try {
    const rpcArgs: Record<string, unknown> = {
      query_embedding: queryVector,
      match_count: topK * 2, // over-fetch for fusion
      match_threshold: opts.vectorThreshold ?? 0.3,
    };
    if (opts.sourceFilter) rpcArgs.filter_source = opts.sourceFilter;
    const { data, error } = await opts.supabase.rpc(
      "match_knowledge_chunks",
      rpcArgs
    );
    if (error) {
      console.warn("[rag] vector search error:", error.message);
    } else if (data) {
      vectorRows = data as VectorRow[];
    }
  } catch (e: any) {
    console.warn("[rag] vector search exception:", e?.message);
  }

  // 3. BM25 full-text search via PostgREST
  let bm25Rows: Bm25Row[] = [];
  try {
    let q = opts.supabase
      .from("knowledge_chunks")
      .select("id, content, source, metadata, chunk_index")
      .textSearch("content", query, { type: "websearch", config: "english" })
      .limit(topK * 2);
    if (opts.sourceFilter) {
      q = q.eq("source", opts.sourceFilter);
    }
    const { data, error } = await q;
    if (error) {
      console.warn("[rag] bm25 search error:", error.message);
    } else if (data) {
      bm25Rows = data as Bm25Row[];
    }
  } catch (e: any) {
    console.warn("[rag] bm25 search exception:", e?.message);
  }

  // 4. Combine via RRF (skip zero-weight rankers)
  const fused = new Map<string, { row: any; score: number }>();
  const addRanked = (list: any[], weight: number) => {
    if (weight <= 0) return;
    list.forEach((row, idx) => {
      const rank = idx + 1;
      const contribution = weight / (k + rank);
      const existing = fused.get(row.id);
      if (existing) {
        existing.score += contribution;
      } else {
        fused.set(row.id, { row, score: contribution });
      }
    });
  };
  addRanked(vectorRows, vectorWeight);
  addRanked(bm25Rows, bm25Weight);

  // 5. Map to RetrievedChunk
  const vectorIds = new Set(vectorRows.map((r) => r.id));
  const bm25Ids = new Set(bm25Rows.map((r) => r.id));

  const chunks: RetrievedChunk[] = [];
  for (const { row, score } of fused.values()) {
    const inVector = vectorIds.has(row.id);
    const inBm25 = bm25Ids.has(row.id);
    const origin: RetrievedChunk["origin"] =
      inVector && inBm25 ? "hybrid" : inVector ? "vector" : "bm25";
    chunks.push({
      id: row.id,
      content: row.content,
      source: row.source,
      metadata: row.metadata ?? {},
      chunk_index: row.chunk_index,
      score,
      origin,
    });
  }

  chunks.sort((a, b) => b.score - a.score);
  return chunks.slice(0, topK);
}
