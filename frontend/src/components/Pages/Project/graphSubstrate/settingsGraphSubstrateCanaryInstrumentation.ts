export type SettingsGraphSubstrateCanaryInstrumentationSnapshot = {
  mounted: boolean;
  mountedSceneSectionCount: number;
  mountedSectionBodyCount: number;
  pixiDrawableCount: number;
  pixiSyncCount: number;
  sceneSyncCount: number;
  unresolvedSectionSeedFallbackCount: number;
  viewportZoom: number | null;
  visibleViewportSize: { height: number; width: number } | null;
};

type SettingsGraphSubstrateCanaryInstrumentationScope = typeof globalThis & {
  __settaSettingsGraphSubstrateCanaryInstrumentation?: SettingsGraphSubstrateCanaryInstrumentationSnapshot;
};

export function createEmptySettingsGraphSubstrateCanaryInstrumentationSnapshot(): SettingsGraphSubstrateCanaryInstrumentationSnapshot {
  return {
    mounted: false,
    mountedSceneSectionCount: 0,
    mountedSectionBodyCount: 0,
    pixiDrawableCount: 0,
    pixiSyncCount: 0,
    sceneSyncCount: 0,
    unresolvedSectionSeedFallbackCount: 0,
    viewportZoom: null,
    visibleViewportSize: null,
  };
}

export function readSettingsGraphSubstrateCanaryInstrumentationSnapshot(): SettingsGraphSubstrateCanaryInstrumentationSnapshot {
  const currentSnapshot =
    getSettingsGraphSubstrateCanaryInstrumentationScope()
      .__settaSettingsGraphSubstrateCanaryInstrumentation;
  return currentSnapshot
    ? cloneSettingsGraphSubstrateCanaryInstrumentationSnapshot(currentSnapshot)
    : createEmptySettingsGraphSubstrateCanaryInstrumentationSnapshot();
}

export function updateSettingsGraphSubstrateCanaryInstrumentationSnapshot(
  patch: Partial<SettingsGraphSubstrateCanaryInstrumentationSnapshot>,
): SettingsGraphSubstrateCanaryInstrumentationSnapshot {
  const scope = getSettingsGraphSubstrateCanaryInstrumentationScope();
  const nextSnapshot = {
    ...readSettingsGraphSubstrateCanaryInstrumentationSnapshot(),
    ...patch,
  };
  scope.__settaSettingsGraphSubstrateCanaryInstrumentation =
    cloneSettingsGraphSubstrateCanaryInstrumentationSnapshot(nextSnapshot);
  return nextSnapshot;
}

export function resetSettingsGraphSubstrateCanaryInstrumentationSnapshot() {
  getSettingsGraphSubstrateCanaryInstrumentationScope().__settaSettingsGraphSubstrateCanaryInstrumentation =
    createEmptySettingsGraphSubstrateCanaryInstrumentationSnapshot();
}

function getSettingsGraphSubstrateCanaryInstrumentationScope(): SettingsGraphSubstrateCanaryInstrumentationScope {
  return globalThis as SettingsGraphSubstrateCanaryInstrumentationScope;
}

function cloneSettingsGraphSubstrateCanaryInstrumentationSnapshot(
  snapshot: SettingsGraphSubstrateCanaryInstrumentationSnapshot,
): SettingsGraphSubstrateCanaryInstrumentationSnapshot {
  return {
    ...snapshot,
    visibleViewportSize: snapshot.visibleViewportSize
      ? { ...snapshot.visibleViewportSize }
      : null,
  };
}
