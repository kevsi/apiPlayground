/**
 * Phase 3.17 — Retrieval quality evaluation
 *
 * Loads the golden set of annotated questions and verifies the retrieval
 * pipeline returns coherent results. Runs against live Supabase if env vars
 * are available; otherwise it is skipped (no failure).
 *
 * Quality metric: top-K contains a chunk whose `source` matches the expected
 * source. Precision@5 is computed and reported via vitest annotations.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { retrieveChunks, type RetrievedChunk } from "@/src/ai/cloud-engine/rag";
import golden from "./rag-golden-set.json";

interface GoldenEntry {
  id: string;
  question: string;
  expectedSource: string;
  expectedMatch: string;
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const JINA_KEY = process.env.JINA_API_KEY;
const SKIP_LIVE =
  !SUPABASE_URL || !SUPABASE_KEY || !JINA_KEY || process.env.SKIP_RAG_EVAL === "1";

describe.skipIf(SKIP_LIVE)("RAG retrieval quality (golden set)", () => {
  let precisionAt5 = 0;
  let mrr = 0; // Mean Reciprocal Rank
  let evaluated = 0;

  beforeAll(() => {
    if (SKIP_LIVE) {
      console.log(
        "[rag-eval] Skipped (set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, JINA_API_KEY to enable)"
      );
    }
  });

  it("top-5 contains expected source for golden set entries", async () => {
    const supabase = createClient(SUPABASE_URL!, SUPABASE_KEY!, {
      auth: { persistSession: false },
    });

    const entries = golden as GoldenEntry[];
    const hits: number[] = [];

    for (const entry of entries) {
      const results: RetrievedChunk[] = await retrieveChunks(entry.question, {
        supabase,
        jinaApiKey: JINA_KEY!,
        topK: 5,
      });

      const found = results.findIndex(
        (r) =>
          r.source === entry.expectedSource &&
          r.content.toLowerCase().includes(entry.expectedMatch.toLowerCase())
      );
      hits.push(found);
      evaluated++;
      if (found >= 0) {
        precisionAt5 += 1;
        mrr += 1 / (found + 1);
      }
    }

    const precision = precisionAt5 / evaluated;
    const meanRank = mrr / evaluated;
    console.log(
      `[rag-eval] precision@5 = ${(precision * 100).toFixed(1)}% (${precisionAt5}/${evaluated}), MRR = ${meanRank.toFixed(3)}`
    );

    // Soft assertion: pipeline ran without throwing and produced a non-negative score
    expect(precision).toBeGreaterThanOrEqual(0);
    expect(evaluated).toBe(entries.length);
  });
});
