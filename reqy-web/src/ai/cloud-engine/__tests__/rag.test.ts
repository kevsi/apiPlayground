import { describe, it, expect, vi, beforeEach } from "vitest";
import { retrieveChunks } from "@/src/ai/cloud-engine/rag";

// Mock embedSentences to return predictable vectors without hitting Jina API
vi.mock("@/src/ai/cloud-engine/jina", () => ({
  embedSentences: vi.fn(async (sentences: string[]) => {
    return sentences.map(() => new Array(1024).fill(0.1));
  }),
}));

function mockSupabase({
  vectorRows = [],
  bm25Rows = [],
  vectorError = null,
  bm25Error = null,
}: {
  vectorRows?: any[];
  bm25Rows?: any[];
  vectorError?: { message: string } | null;
  bm25Error?: { message: string } | null;
} = {}) {
  const rpc = vi.fn().mockResolvedValue({ data: vectorRows, error: vectorError });
  const textSearch = vi.fn().mockReturnValue({
    limit: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
  });
  const select = vi.fn().mockReturnValue({
    textSearch,
    limit: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
  });

  // Make the chainable work: .from(...).select(...).textSearch(...).limit(...).eq(...)
  const chainLimit = vi.fn().mockResolvedValue({ data: bm25Rows, error: bm25Error });
  const chainEq = vi.fn(() => ({ limit: chainLimit }));
  textSearch.mockReturnValue({
    limit: chainLimit,
    eq: chainEq,
  });

  return {
    rpc,
    from: vi.fn().mockReturnValue({
      select,
      textSearch,
    }),
  } as any;
}

describe("retrieveChunks (hybrid RRF)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty array when no chunks match", async () => {
    const sb = mockSupabase({ vectorRows: [], bm25Rows: [] });
    const result = await retrieveChunks("test query", {
      supabase: sb,
      jinaApiKey: "test-key",
    });
    expect(result).toEqual([]);
  });

  it("fuses vector + bm25 results via RRF", async () => {
    const sb = mockSupabase({
      vectorRows: [
        { id: "a", content: "A", source: "iana", metadata: {}, chunk_index: 0, similarity: 0.9 },
        { id: "b", content: "B", source: "iana", metadata: {}, chunk_index: 1, similarity: 0.7 },
      ],
      bm25Rows: [
        { id: "b", content: "B", source: "iana", metadata: {}, chunk_index: 1 },
        { id: "c", content: "C", source: "iana", metadata: {}, chunk_index: 2 },
      ],
    });

    const result = await retrieveChunks("test", {
      supabase: sb,
      jinaApiKey: "test-key",
      topK: 5,
    });

    expect(result.length).toBe(3);
    // "b" appears in both — should have highest score (origin "hybrid")
    expect(result[0].id).toBe("b");
    expect(result[0].origin).toBe("hybrid");
    expect(result[0].score).toBeGreaterThan(result[1].score);
  });

  it("respects topK", async () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({
      id: `id-${i}`,
      content: `chunk ${i}`,
      source: "iana",
      metadata: {},
      chunk_index: i,
      similarity: 1 - i * 0.01,
    }));
    const sb = mockSupabase({ vectorRows: rows, bm25Rows: [] });

    const result = await retrieveChunks("query", {
      supabase: sb,
      jinaApiKey: "test-key",
      topK: 3,
    });
    expect(result.length).toBe(3);
  });

  it("tags origin: 'vector' or 'bm25' when result is in only one list", async () => {
    const sb = mockSupabase({
      vectorRows: [
        { id: "v-only", content: "V", source: "iana", metadata: {}, chunk_index: 0, similarity: 0.9 },
      ],
      bm25Rows: [
        { id: "b-only", content: "B", source: "iana", metadata: {}, chunk_index: 0 },
      ],
    });
    const result = await retrieveChunks("q", {
      supabase: sb,
      jinaApiKey: "test-key",
    });
    const origins = Object.fromEntries(result.map((r) => [r.id, r.origin]));
    expect(origins["v-only"]).toBe("vector");
    expect(origins["b-only"]).toBe("bm25");
  });

  it("tolerates Supabase errors gracefully", async () => {
    const sb = mockSupabase({
      vectorError: { message: "vector rpc down" },
      bm25Error: { message: "bm25 down" },
    });
    const result = await retrieveChunks("q", {
      supabase: sb,
      jinaApiKey: "test-key",
    });
    expect(result).toEqual([]);
  });

  it("applies sourceFilter to both queries", async () => {
    const sb = mockSupabase({
      vectorRows: [
        { id: "1", content: "A", source: "rfc-9110", metadata: {}, chunk_index: 0, similarity: 0.9 },
      ],
      bm25Rows: [],
    });
    await retrieveChunks("q", {
      supabase: sb,
      jinaApiKey: "test-key",
      sourceFilter: "rfc-9110",
    });
    // Verify rpc was called with filter_source
    const rpcCalls = sb.rpc.mock.calls;
    expect(rpcCalls[0][1]).toHaveProperty("filter_source", "rfc-9110");
  });

  it("weights: vectorWeight=1 means only vector counts", async () => {
    const sb = mockSupabase({
      vectorRows: [
        { id: "a", content: "A", source: "iana", metadata: {}, chunk_index: 0, similarity: 0.9 },
      ],
      bm25Rows: [
        { id: "b", content: "B", source: "iana", metadata: {}, chunk_index: 0 },
      ],
    });
    const result = await retrieveChunks("q", {
      supabase: sb,
      jinaApiKey: "test-key",
      vectorWeight: 1.0,
    });
    // Only "a" should have non-zero score
    expect(result.length).toBe(1);
    expect(result[0].id).toBe("a");
  });
});
