export type CanvasEngineDomIslandMountPolicyInput = {
  activeSectionIds: string[];
  viewportSectionIds: string[];
  previousMountedSectionIds: string[];
  retentionExpiryBySectionId: Map<string, number>;
  nowMs: number;
  retentionMs: number;
  maxRetainedSections: number;
  hasRectForSection: (sectionId: string) => boolean;
  sortSectionIds: (sectionIds: string[]) => string[];
};

export type CanvasEngineDomIslandMountPolicyResult = {
  mountedSectionIds: string[];
  retainedSectionCount: number;
};

export function resolveDomIslandMountPolicy(
  input: CanvasEngineDomIslandMountPolicyInput,
): CanvasEngineDomIslandMountPolicyResult {
  const keepMountedSectionIds = new Set<string>(input.viewportSectionIds);
  for (const activeSectionId of input.activeSectionIds) {
    keepMountedSectionIds.add(activeSectionId);
  }

  const retentionExpiryBySectionId = input.retentionExpiryBySectionId;
  for (const sectionId of keepMountedSectionIds) {
    retentionExpiryBySectionId.delete(sectionId);
  }

  for (const sectionId of input.previousMountedSectionIds) {
    if (keepMountedSectionIds.has(sectionId)) {
      continue;
    }
    if (!input.hasRectForSection(sectionId)) {
      retentionExpiryBySectionId.delete(sectionId);
      continue;
    }
    if (!retentionExpiryBySectionId.has(sectionId)) {
      retentionExpiryBySectionId.set(
        sectionId,
        input.nowMs + input.retentionMs,
      );
    }
  }

  for (const [sectionId, expiryMs] of Array.from(
    retentionExpiryBySectionId.entries(),
  )) {
    if (!input.hasRectForSection(sectionId) || expiryMs <= input.nowMs) {
      retentionExpiryBySectionId.delete(sectionId);
    }
  }

  const maxRetainedSections = Math.max(0, input.maxRetainedSections);
  if (retentionExpiryBySectionId.size > maxRetainedSections) {
    const retainedEntriesByExpiryAscending = Array.from(
      retentionExpiryBySectionId.entries(),
    ).sort((left, right) => left[1] - right[1]);
    const overflowCount =
      retainedEntriesByExpiryAscending.length - maxRetainedSections;
    for (let index = 0; index < overflowCount; index += 1) {
      const entry = retainedEntriesByExpiryAscending[index];
      if (entry) {
        retentionExpiryBySectionId.delete(entry[0]);
      }
    }
  }

  const mountedSectionIdSet = new Set<string>(keepMountedSectionIds);
  for (const sectionId of retentionExpiryBySectionId.keys()) {
    mountedSectionIdSet.add(sectionId);
  }

  return {
    mountedSectionIds: input.sortSectionIds(Array.from(mountedSectionIdSet)),
    retainedSectionCount: retentionExpiryBySectionId.size,
  };
}

export function getNextDomIslandRetentionDelayMs(
  retentionExpiryBySectionId: Map<string, number>,
  nowMs: number,
): number | null {
  let nextExpiryMs: number | null = null;
  for (const expiryMs of retentionExpiryBySectionId.values()) {
    if (nextExpiryMs === null || expiryMs < nextExpiryMs) {
      nextExpiryMs = expiryMs;
    }
  }
  if (nextExpiryMs === null) {
    return null;
  }
  return Math.max(0, nextExpiryMs - nowMs);
}
