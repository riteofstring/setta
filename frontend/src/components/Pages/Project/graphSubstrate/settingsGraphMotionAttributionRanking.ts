import type {
  SettingsGraphSubstrateCanaryMotionAttribution,
  SettingsGraphSubstrateCanaryMotionAttributionOwner,
} from "./settingsGraphSubstrateCanaryInstrumentation";

export type SettingsGraphMotionPerfTopOwner = {
  count: number;
  maxDurationMs: number;
  owner: SettingsGraphSubstrateCanaryMotionAttributionOwner;
  totalDurationMs: number;
};

export const SETTINGS_GRAPH_SUBSTRATE_CANARY_CUMULATIVE_SECTION_RENDER_OWNERS: ReadonlySet<SettingsGraphSubstrateCanaryMotionAttributionOwner> =
  new Set([
    "presentedSceneSectionSubtreeReactRender",
    "presentedSceneSectionBodySubtreeReactRender",
    "presentedSceneSectionContainerReactRender",
    "presentedSceneSectionCoreShellLayerReactRender",
    "presentedSceneSectionBodyContentReactRender",
    "presentedSceneSectionCanvasSectionBodyReactRender",
    "presentedSceneSectionAreaSwitchReactRender",
  ]);

export function resolveDominantMotionAttributionOwner(
  motionAttribution: SettingsGraphSubstrateCanaryMotionAttribution,
): SettingsGraphSubstrateCanaryMotionAttributionOwner | null {
  const topOwner = resolveTopMotionAttributionOwners(motionAttribution, 1)[0];
  return topOwner?.owner ?? null;
}

export function resolveTopMotionAttributionOwners(
  motionAttribution: SettingsGraphSubstrateCanaryMotionAttribution,
  limit = 5,
): Array<SettingsGraphMotionPerfTopOwner> {
  return resolveTopMotionAttributionOwnersExcluding(
    motionAttribution,
    new Set<SettingsGraphSubstrateCanaryMotionAttributionOwner>(),
    limit,
  );
}

export function resolveTopMotionAttributionOwnersExcluding(
  motionAttribution: SettingsGraphSubstrateCanaryMotionAttribution,
  excludedOwners: ReadonlySet<SettingsGraphSubstrateCanaryMotionAttributionOwner>,
  limit = 5,
): Array<SettingsGraphMotionPerfTopOwner> {
  if (limit <= 0) {
    return [];
  }

  return (
    Object.entries(motionAttribution) as Array<
      [
        SettingsGraphSubstrateCanaryMotionAttributionOwner,
        SettingsGraphSubstrateCanaryMotionAttribution[keyof SettingsGraphSubstrateCanaryMotionAttribution],
      ]
    >
  )
    .filter(
      ([owner, entry]) =>
        !excludedOwners.has(owner) && entry.totalDurationMs > 0,
    )
    .sort((left, right) => {
      if (right[1].totalDurationMs !== left[1].totalDurationMs) {
        return right[1].totalDurationMs - left[1].totalDurationMs;
      }
      if (right[1].maxDurationMs !== left[1].maxDurationMs) {
        return right[1].maxDurationMs - left[1].maxDurationMs;
      }
      if (right[1].count !== left[1].count) {
        return right[1].count - left[1].count;
      }
      return left[0].localeCompare(right[0]);
    })
    .slice(0, limit)
    .map(([owner, entry]) => ({
      count: entry.count,
      maxDurationMs: entry.maxDurationMs,
      owner,
      totalDurationMs: entry.totalDurationMs,
    }));
}
