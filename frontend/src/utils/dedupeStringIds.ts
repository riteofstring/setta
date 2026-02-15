export function dedupeStringIds(ids: string[]): string[] {
  const dedupedIds: string[] = [];
  const seenIds = new Set<string>();
  for (const id of ids) {
    if (seenIds.has(id)) {
      continue;
    }
    seenIds.add(id);
    dedupedIds.push(id);
  }
  return dedupedIds;
}
