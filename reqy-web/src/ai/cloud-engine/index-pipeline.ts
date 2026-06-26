/**
 * Phase 3.4 — Generic Indexing Pipeline
 *
 * Chunks any document text into overlapping fragments, embeds them via Jina,
 * and upserts the (chunk, embedding, metadata) tuples into Supabase.
 *
 * Designed to be called from a server-side API route or a CLI script.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { embedSentences, JINA_MAX_BATCH_SIZE, VECTOR_DIM } from "./jina";

export interface SourceDocument {
  /** Raw text of the document (can be very long). */
  content: string;
  /** Source identifier, e.g. "rfc-9110", "mdn-http". */
  source: string;
  /** Extra metadata stored as JSONB (section, url, title, etc.). */
  metadata?: Record<string, unknown>;
}

export interface IndexPipelineOptions {
  supabase: SupabaseClient;
  jinaApiKey: string;
  /** Target chunk size in characters (default: 512). */
  chunkSize?: number;
  /** Overlap between consecutive chunks in characters (default: 64). */
  chunkOverlap?: number;
  /** Called after each batch with (doneSentences, totalSentences). */
  onProgress?: (done: number, total: number) => void;
  /** Delete existing chunks for these sources before inserting (default true). */
  clean?: boolean;
}

export interface IndexResult {
  /** Number of chunks successfully upserted. */
  inserted: number;
  /** Number of chunks that failed upsert. */
  failed: number;
  /** Total embedding dimension (should equal VECTOR_DIM). */
  dim: number;
}

/**
 * Naïve character-based chunking with sliding window.
 * Step 3.13 will replace this with refined recursive-character chunking.
 */
export function chunkText(
  text: string,
  size = 512,
  overlap = 64
): string[] {
  if (text.length <= size) {
    return text.trim().length > 0 ? [text.trim()] : [];
  }

  const step = Math.max(1, size - overlap);
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += step) {
    const end = Math.min(i + size, text.length);
    const slice = text.slice(i, end).trim();
    if (slice.length > 0) chunks.push(slice);
    if (end >= text.length) break;
  }
  return chunks;
}

/**
 * Index a set of documents into `knowledge_chunks`.
 *
 * 1. chunk text
 * 2. embed chunks via Jina (batching + backoff handled by jina.ts)
 * 3. upsert rows into Supabase
 * 4. (optional) clean old chunks for same sources first
 */
export async function indexDocuments(
  docs: SourceDocument[],
  opts: IndexPipelineOptions
): Promise<IndexResult> {
  const chunkSize = opts.chunkSize ?? 512;
  const chunkOverlap = opts.chunkOverlap ?? 64;
  const supabase = opts.supabase;

  // 1. Flatten documents into ordered chunks
  const sentences: string[] = [];
  const metaIndex: Array<{
    source: string;
    chunkIndex: number;
    metadata: Record<string, unknown>;
    docIndex: number;
  }> = [];

  for (let d = 0; d < docs.length; d++) {
    const doc = docs[d];
    const chunks = chunkText(doc.content, chunkSize, chunkOverlap);
    for (let c = 0; c < chunks.length; c++) {
      sentences.push(chunks[c]);
      metaIndex.push({
        source: doc.source,
        chunkIndex: c,
        metadata: doc.metadata ?? {},
        docIndex: d,
      });
    }
  }

  const total = sentences.length;
  if (total === 0) {
    return { inserted: 0, failed: 0, dim: VECTOR_DIM };
  }

  // Optional: clear existing chunks for these sources
  if (opts.clean !== false) {
    const sources = [...new Set(docs.map((d) => d.source))];
    const { error } = await supabase
      .from("knowledge_chunks")
      .delete()
      .in("source", sources);
    if (error) {
      console.warn("[index] Failed to clean old chunks:", error.message);
    }
  }

  // 2. Embed
  const embeddings = await embedSentences(sentences, {
    apiKey: opts.jinaApiKey,
  });

  if (embeddings.length !== total) {
    throw new Error(`Embedding count mismatch: ${embeddings.length} vs ${total}`);
  }

  // 3. Upsert in batches (Supabase has a 1k row limit per upsert)
  const UPSERT_BATCH = 500;
  let inserted = 0;
  let failed = 0;

  for (let i = 0; i < total; i += UPSERT_BATCH) {
    const batchRows = [];
    for (let j = i; j < Math.min(i + UPSERT_BATCH, total); j++) {
      const emb = embeddings[j];
      const meta = metaIndex[j];
      batchRows.push({
        content: sentences[j],
        embedding: emb,
        source: meta.source,
        metadata: { ...meta.metadata, chunkIndex: meta.chunkIndex },
        chunk_index: meta.chunkIndex,
      });
    }

    const { data, error } = await supabase
      .from("knowledge_chunks")
      .upsert(batchRows, { onConflict: undefined });

    if (error) {
      console.warn(`[index] Upsert batch ${i}-${i + UPSERT_BATCH} failed:`, error.message);
      failed += batchRows.length;
    } else {
      inserted += batchRows.length;
      opts.onProgress?.(Math.min(i + UPSERT_BATCH, total), total);
    }
  }

  return { inserted, failed, dim: VECTOR_DIM };
}
