export const SETTINGS_GRAPH_SUBSTRATE_CANARY_MOTION_ATTRIBUTION_OWNERS = [
  "interactionMiscStateSync",
  "interactionReactFlowStateSync",
  "mountedSectionBodyIdSetReuseCheck",
  "pixiDrawableModelResolve",
  "pixiDrawableReuseCheck",
  "pixiViewportPresent",
  "presentedSceneSectionArrayReuseCheck",
  "presentedSceneBodyMountFilter",
  "presentedSceneSectionEntriesResolve",
  "presentedSceneSectionVisibilityFilter",
  "presentedSceneVisibleViewportWorldRectResolve",
  "reactFlowTransformFollowerCallback",
  "reactFlowTransformSubscriptionCallback",
  "reactFlowViewportPublish",
  "viewportPersistenceDispatch",
] as const;

export type SettingsGraphSubstrateCanaryMotionAttributionOwner =
  (typeof SETTINGS_GRAPH_SUBSTRATE_CANARY_MOTION_ATTRIBUTION_OWNERS)[number];

export type SettingsGraphSubstrateCanaryMotionAttributionEntry = {
  count: number;
  maxDurationMs: number;
  totalDurationMs: number;
};

export type SettingsGraphSubstrateCanaryMotionAttribution = Record<
  SettingsGraphSubstrateCanaryMotionAttributionOwner,
  SettingsGraphSubstrateCanaryMotionAttributionEntry
>;

export type SettingsGraphSubstrateCanaryInstrumentationSnapshot = {
  mounted: boolean;
  mountedSceneSectionCount: number;
  mountedSectionBodyCount: number;
  motionAttribution: SettingsGraphSubstrateCanaryMotionAttribution;
  motionAttributionActive: boolean;
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
    motionAttribution:
      createEmptySettingsGraphSubstrateCanaryMotionAttribution(),
    motionAttributionActive: false,
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

export function measureSettingsGraphSubstrateCanaryMotionAttribution<T>(
  owner: SettingsGraphSubstrateCanaryMotionAttributionOwner,
  fn: () => T,
): T {
  const scope = getSettingsGraphSubstrateCanaryInstrumentationScope();
  const snapshot = scope.__settaSettingsGraphSubstrateCanaryInstrumentation;
  if (!snapshot?.motionAttributionActive) {
    return fn();
  }

  const startTimestamp = performance.now();
  const result = fn();
  const durationMs = performance.now() - startTimestamp;
  const currentEntry = snapshot.motionAttribution[owner];
  snapshot.motionAttribution[owner] = {
    count: currentEntry.count + 1,
    maxDurationMs: Math.max(currentEntry.maxDurationMs, durationMs),
    totalDurationMs: currentEntry.totalDurationMs + durationMs,
  };
  return result;
}

function getSettingsGraphSubstrateCanaryInstrumentationScope(): SettingsGraphSubstrateCanaryInstrumentationScope {
  return globalThis as SettingsGraphSubstrateCanaryInstrumentationScope;
}

function cloneSettingsGraphSubstrateCanaryInstrumentationSnapshot(
  snapshot: SettingsGraphSubstrateCanaryInstrumentationSnapshot,
): SettingsGraphSubstrateCanaryInstrumentationSnapshot {
  return {
    ...snapshot,
    motionAttribution: cloneSettingsGraphSubstrateCanaryMotionAttribution(
      snapshot.motionAttribution,
    ),
    visibleViewportSize: snapshot.visibleViewportSize
      ? { ...snapshot.visibleViewportSize }
      : null,
  };
}

function createEmptySettingsGraphSubstrateCanaryMotionAttribution(): SettingsGraphSubstrateCanaryMotionAttribution {
  return Object.fromEntries(
    SETTINGS_GRAPH_SUBSTRATE_CANARY_MOTION_ATTRIBUTION_OWNERS.map((owner) => [
      owner,
      {
        count: 0,
        maxDurationMs: 0,
        totalDurationMs: 0,
      },
    ]),
  ) as SettingsGraphSubstrateCanaryMotionAttribution;
}

function cloneSettingsGraphSubstrateCanaryMotionAttribution(
  motionAttribution: SettingsGraphSubstrateCanaryMotionAttribution,
): SettingsGraphSubstrateCanaryMotionAttribution {
  return Object.fromEntries(
    SETTINGS_GRAPH_SUBSTRATE_CANARY_MOTION_ATTRIBUTION_OWNERS.map((owner) => [
      owner,
      { ...motionAttribution[owner] },
    ]),
  ) as SettingsGraphSubstrateCanaryMotionAttribution;
}
