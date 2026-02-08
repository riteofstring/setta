import { describe, expect, it } from "vitest";
import {
  MAX_SYNTAX_LINE_CACHE_ENTRIES,
  setSyntaxLineCacheEntry,
  type SyntaxLineCacheEntry,
} from "./gitDiffSyntaxCache";

function entry(label: string): SyntaxLineCacheEntry {
  return {
    text: label,
    marks: [[0, 1, "cm-test"]],
  };
}

describe("setSyntaxLineCacheEntry", () => {
  it("evicts the oldest cache entry when capacity is exceeded", () => {
    const cache = new Map<number, SyntaxLineCacheEntry>();
    for (let i = 0; i < MAX_SYNTAX_LINE_CACHE_ENTRIES; i += 1) {
      setSyntaxLineCacheEntry(cache, i, entry(`line-${i}`));
    }

    setSyntaxLineCacheEntry(cache, MAX_SYNTAX_LINE_CACHE_ENTRIES, entry("extra"));

    expect(cache.size).toBe(MAX_SYNTAX_LINE_CACHE_ENTRIES);
    expect(cache.has(0)).toBe(false);
    expect(cache.has(1)).toBe(true);
  });

  it("treats updates as recently-used and preserves them during later eviction", () => {
    const cache = new Map<number, SyntaxLineCacheEntry>();
    for (let i = 0; i < MAX_SYNTAX_LINE_CACHE_ENTRIES; i += 1) {
      setSyntaxLineCacheEntry(cache, i, entry(`line-${i}`));
    }

    // Refresh key 0 so key 1 becomes the oldest candidate for eviction.
    setSyntaxLineCacheEntry(cache, 0, entry("line-0-updated"));
    setSyntaxLineCacheEntry(cache, MAX_SYNTAX_LINE_CACHE_ENTRIES, entry("extra"));

    expect(cache.size).toBe(MAX_SYNTAX_LINE_CACHE_ENTRIES);
    expect(cache.has(0)).toBe(true);
    expect(cache.has(1)).toBe(false);
  });
});
