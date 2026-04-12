export type SyntaxLineCacheEntry = {
  text: string;
  marks: Array<[number, number, string]>;
};

const MAX_SYNTAX_LINE_CACHE_ENTRIES = 1500;

export function setSyntaxLineCacheEntry(
  cache: Map<number, SyntaxLineCacheEntry>,
  lineFrom: number,
  entry: SyntaxLineCacheEntry,
): void {
  if (cache.has(lineFrom)) {
    cache.delete(lineFrom);
  }
  cache.set(lineFrom, entry);
  if (cache.size <= MAX_SYNTAX_LINE_CACHE_ENTRIES) {
    return;
  }
  const oldestKey = cache.keys().next();
  if (!oldestKey.done) {
    cache.delete(oldestKey.value);
  }
}
