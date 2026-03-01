import type { SceneGraphRendererFlags } from "./flags";

export type SceneGraphRendererRolloutSurface = {
  projectConfigId: string;
  projectConfigName: string;
  activeViewModeName: string;
};

const SCENE_GRAPH_RENDERER_DEFAULT_ON_PROJECT_CONFIG_NAMES: ReadonlySet<string> =
  new Set(["settings"]);
const SCENE_GRAPH_RENDERER_DEFAULT_ON_PROJECT_CONFIG_IDS: ReadonlySet<string> =
  new Set();
const SCENE_GRAPH_RENDERER_DEFAULT_ON_SURFACES: readonly SceneGraphRendererRolloutSurface[] =
  [];

export function isSceneGraphRendererDefaultOnSurface(
  surface: SceneGraphRendererRolloutSurface,
  rolloutProjectConfigIds: readonly string[] = [],
): boolean {
  if (
    SCENE_GRAPH_RENDERER_DEFAULT_ON_PROJECT_CONFIG_NAMES.has(
      surface.projectConfigName,
    )
  ) {
    return true;
  }
  if (
    isSceneGraphRendererDefaultOnProjectConfigId(
      surface.projectConfigId,
      rolloutProjectConfigIds,
    )
  ) {
    return true;
  }
  for (const candidateSurface of SCENE_GRAPH_RENDERER_DEFAULT_ON_SURFACES) {
    if (
      candidateSurface.projectConfigId === surface.projectConfigId &&
      candidateSurface.projectConfigName === surface.projectConfigName &&
      candidateSurface.activeViewModeName === surface.activeViewModeName
    ) {
      return true;
    }
  }
  return false;
}

export function resolveSceneGraphRendererRolloutFlags(input: {
  persistedFlags: SceneGraphRendererFlags;
  surface: SceneGraphRendererRolloutSurface;
  hasEnabledStorageOverride: boolean;
  rolloutProjectConfigIds: readonly string[];
}): SceneGraphRendererFlags {
  if (input.hasEnabledStorageOverride) {
    return input.persistedFlags;
  }
  if (
    !isSceneGraphRendererDefaultOnSurface(
      input.surface,
      input.rolloutProjectConfigIds,
    )
  ) {
    return input.persistedFlags;
  }
  return {
    ...input.persistedFlags,
    enabled: true,
  };
}

function isSceneGraphRendererDefaultOnProjectConfigId(
  projectConfigId: string,
  rolloutProjectConfigIds: readonly string[],
): boolean {
  if (SCENE_GRAPH_RENDERER_DEFAULT_ON_PROJECT_CONFIG_IDS.has(projectConfigId)) {
    return true;
  }
  for (const candidateProjectConfigId of rolloutProjectConfigIds) {
    if (candidateProjectConfigId === projectConfigId) {
      return true;
    }
  }
  return false;
}
