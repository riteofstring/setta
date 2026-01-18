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
): Record<string, string | null> | null {
  const payloads: Record<string, string | null> = {};
  for (const sectionId of sectionIds) {
    const provider = drawSnapshotProviders.get(sectionId);
    if (!provider) {
      continue;
    }
    const payload = provider();
    if (payload === null) {
      continue;
    }
    payloads[sectionId] = payload;
  }
  return Object.keys(payloads).length > 0 ? payloads : null;
}
