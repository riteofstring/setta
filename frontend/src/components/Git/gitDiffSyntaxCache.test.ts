import { describe, expect, it } from "vitest";
import {
  setSyntaxLineCacheEntry,
  type SyntaxLineCacheEntry,
} from "./gitDiffSyntaxCache";

function entry(label: string): SyntaxLineCacheEntry {
  return {
    text: label,
    marks: [[0, 1, "cm-test"]],
  };
}

function discoverSyntaxCacheCapacity(): number {
  const cache = new Map<number, SyntaxLineCacheEntry>();
  let nextLine = 0;
  while (true) {
    setSyntaxLineCacheEntry(cache, nextLine, entry(`line-${nextLine}`));
    nextLine += 1;
    if (cache.size < nextLine) {
      return cache.size;
    }
  }
}

describe("setSyntaxLineCacheEntry", () => {
  it("evicts the oldest cache entry when capacity is exceeded", () => {
    const capacity = discoverSyntaxCacheCapacity();
    const cache = new Map<number, SyntaxLineCacheEntry>();
    for (let i = 0; i < capacity; i += 1) {
      setSyntaxLineCacheEntry(cache, i, entry(`line-${i}`));
    }

    setSyntaxLineCacheEntry(cache, capacity, entry("extra"));

    expect(cache.size).toBe(capacity);
    expect(cache.has(0)).toBe(false);
    expect(cache.has(1)).toBe(true);
  });

  it("treats updates as recently-used and preserves them during later eviction", () => {
    const capacity = discoverSyntaxCacheCapacity();
    const cache = new Map<number, SyntaxLineCacheEntry>();
    for (let i = 0; i < capacity; i += 1) {
      setSyntaxLineCacheEntry(cache, i, entry(`line-${i}`));
    }

    // Refresh key 0 so key 1 becomes the oldest candidate for eviction.
    setSyntaxLineCacheEntry(cache, 0, entry("line-0-updated"));
    setSyntaxLineCacheEntry(cache, capacity, entry("extra"));

    expect(cache.size).toBe(capacity);
    expect(cache.has(0)).toBe(true);
    expect(cache.has(1)).toBe(false);
  });
});
