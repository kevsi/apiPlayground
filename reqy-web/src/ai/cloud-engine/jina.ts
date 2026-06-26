/**
 * Phase 3.3 — Jina Embeddings v3 client
 *
 * Thin wrapper around `https://api.jina.ai/v1/embeddings` that:
 * - Batches sentences to stay within rate limits
 * - Retries with exponential backoff on 429 or network errors
 * - Returns raw float vectors (1024-d) ready for pgvector
 */

export const JINA_BASE_URL = "https://api.jina.ai/v1/embeddings";
export const JINA_MAX_BATCH_SIZE = 128; // empirical safe limit per request
export const JINA_RATE_LIMIT_RPM = 500; // paid tier default
export const VECTOR_DIM = 1024;

export interface EmbedRequest {
  input: string[];
  model?: string;
  normalized?: boolean;
}

export interface EmbedResponse {
  data: Array<{ embedding: number[]; index: number }>;
  model: string;
  object: string;
}

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

/** Load Jina API key from env at runtime. */
export function loadJinaApiKey(): string {
  const key = process.env.JINA_API_KEY;
  if (!key?.trim()) {
    throw new Error(
      "JINA_API_KEY is required for embeddings.\n" +
        "Get one at https://jina.ai/embeddings and add it to .env.local"
    );
  }
  return key.trim();
}

async function embedBatch(
  sentences: string[],
  opts: { apiKey: string; model?: string; normalized?: boolean } = {
    apiKey: "",
    normalized: true,
  }
): Promise<number[][]> {
  const body: EmbedRequest = {
    input: sentences,
    model: opts.model ?? "jina-embeddings-v3",
    normalized: opts.normalized ?? true,
  };

  const res = await fetch(JINA_BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Jina embedding error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as EmbedResponse;
  // Ensure order matches input order
  return data.data
    .sort((a, b) => a.index - b.index)
    .map((item) => item.embedding);
}

/**
 * Embed a list of sentences, automatically batching and respecting rate limits.
 * Returns an array of 1024-d float vectors aligned 1:1 with the input.
 */
export async function embedSentences(
  sentences: string[],
  opts: { apiKey: string; model?: string; normalized?: boolean } = {
    apiKey: "",
    normalized: true,
  }
): Promise<number[][]> {
  if (sentences.length === 0) return [];

  const results: number[][] = new Array(sentences.length);
  const apiKey = opts.apiKey;
  if (!apiKey) {
    throw new Error("Jina API key is required for embedSentences");
  }

  const batches: string[][] = [];
  for (let i = 0; i < sentences.length; i += JINA_MAX_BATCH_SIZE) {
    batches.push(sentences.slice(i, i + JINA_MAX_BATCH_SIZE));
  }

  // Inter-batch rate limit: sleep between batches to stay under RPM
  const msBetweenBatches = Math.ceil(60_000 / JINA_RATE_LIMIT_RPM);

  for (let b = 0; b < batches.length; b++) {
    let retries = 0;
    const maxRetries = 3;

    while (true) {
      try {
        const embeddings = await embedBatch(batches[b], { apiKey, model: opts.model, normalized: opts.normalized });
        const baseIndex = b * JINA_MAX_BATCH_SIZE;
        for (let j = 0; j < embeddings.length; j++) {
          results[baseIndex + j] = embeddings[j];
        }
        break; // success
      } catch (err: any) {
        if (retries >= maxRetries) throw err;
        const delay = Math.pow(2, retries) * 1000 + Math.random() * 500;
        console.warn(`[jina] Retry ${retries + 1}/${maxRetries} after ${Math.round(delay)}ms: ${err.message}`);
        await sleep(delay);
        retries++;
      }
    }

    if (b < batches.length - 1) {
      await sleep(msBetweenBatches);
    }
  }

  return results;
}
