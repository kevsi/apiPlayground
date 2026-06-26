/**
 * Phase 3.3+ — Jina Reader helper
 *
 * Converts any web page into clean Markdown via Jina Reader API.
 * Same API key as Jina Embeddings.
 */
import { loadJinaApiKey } from "./jina";

export const JINA_READER_BASE_URL = "https://r.jina.ai/http://";

export async function fetchDocumentText(url: string): Promise<string> {
  const apiKey = loadJinaApiKey();

  // Normalize URL: r.jina.ai/http://example.com or r.jina.ai/http://example.com
  const normalized = url.replace(/^https?:\/\//, "");
  const readerUrl = `${JINA_READER_BASE_URL}${normalized}`;

  const res = await fetch(readerUrl, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "text/plain",
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Jina Reader error ${res.status} for ${url}: ${body.slice(0, 200)}`);
  }

  return res.text();
}
