#!/usr/bin/env node
/**
 * Phase 3.5-3.12 — Index a knowledge source into Supabase.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/index-knowledge-source.ts <source-id> <url|file-path>
 *
 * Examples:
 *   npx tsx --env-file=.env.local scripts/index-knowledge-source.ts iana-status-codes scripts/data/http-status-codes-guide.txt
 *   npx tsx --env-file=.env.local scripts/index-knowledge-source.ts rfc-9110 https://www.rfc-editor.org/rfc/rfc9110.html
 */
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { indexDocuments } from "../src/ai/cloud-engine/index-pipeline";
import { fetchDocumentText } from "../src/ai/cloud-engine/reader";

async function main() {
  const [, , source, input] = process.argv;
  if (!source || !input) {
    console.error("Usage: tsx --env-file=.env.local scripts/index-knowledge-source.ts <source-id> <url|file-path>");
    process.exit(1);
  }

  console.log(`[index] Source: ${source}`);
  console.log(`[index] Input: ${input}`);

  const content = input.startsWith("http://") || input.startsWith("https://")
    ? await fetchDocumentText(input)
    : await readFile(input, "utf-8");

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }

  const jinaApiKey = process.env.JINA_API_KEY;
  if (!jinaApiKey) {
    throw new Error("JINA_API_KEY is required");
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const result = await indexDocuments(
    [
      {
        content,
        source,
        metadata: {
          importedAt: new Date().toISOString(),
          input,
        },
      },
    ],
    { supabase, jinaApiKey, onProgress: (done, total) => console.log(`[index] ${done}/${total} chunks embedded`) }
  );

  console.log("[index] Result:", result);
}

main().catch((err) => {
  console.error("[index] Fatal error:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
