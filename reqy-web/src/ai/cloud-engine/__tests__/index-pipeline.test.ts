import { describe, it, expect } from "vitest";
import { chunkText } from "@/src/ai/cloud-engine/index-pipeline";

describe("chunkText", () => {
  it("returns single chunk when text fits within size", () => {
    const chunks = chunkText("short text", 512, 64);
    expect(chunks).toEqual(["short text"]);
  });

  it("splits long text into overlapping chunks", () => {
    const text = "a".repeat(1000);
    const chunks = chunkText(text, 512, 64);
    expect(chunks.length).toBeGreaterThan(1);
    //Each chunk should be ≤ target size
    chunks.forEach((c) => expect(c.length).toBeLessThanOrEqual(512));
  });

  it("preserves edge content: last chunk should not be empty", () => {
    const text = "x".repeat(550);
    const chunks = chunkText(text, 512, 64);
    expect(chunks[chunks.length - 1].length).toBeGreaterThan(0);
  });

  it("returns empty array for empty input", () => {
    expect(chunkText("", 512, 64)).toEqual([]);
  });
});
