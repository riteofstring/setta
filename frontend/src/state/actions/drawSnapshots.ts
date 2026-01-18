type DrawSnapshotProvider = () => string | null;

const drawSnapshotProviders = new Map<string, DrawSnapshotProvider>();

export function registerDrawSnapshotProvider(
  sectionId: string,
  provider: DrawSnapshotProvider,
): void {
  drawSnapshotProviders.set(sectionId, provider);
}

export function unregisterDrawSnapshotProvider(sectionId: string): void {
  drawSnapshotProviders.delete(sectionId);
}

export function collectDrawSnapshotPayloads(
  sectionIds: string[],
): Record<string, string | null> {
  const payloads: Record<string, string | null> = {};
  for (const sectionId of sectionIds) {
    const provider = drawSnapshotProviders.get(sectionId);
    if (!provider) {
      payloads[sectionId] = null;
      continue;
    }
    const payload = provider();
    payloads[sectionId] = payload ?? null;
  }
  return payloads;
}
