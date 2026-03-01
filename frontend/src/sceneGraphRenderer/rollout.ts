import type { SceneGraphRendererFlags } from "./flags";

export type SceneGraphRendererRolloutSurface = {
  projectConfigName: string;
  activeViewModeName: string;
};

const SCENE_GRAPH_RENDERER_DEFAULT_ON_SURFACES: readonly SceneGraphRendererRolloutSurface[] =
  [{ projectConfigName: "settings", activeViewModeName: "All Settings" }];

export function isSceneGraphRendererDefaultOnSurface(
  surface: SceneGraphRendererRolloutSurface,
): boolean {
  for (const candidateSurface of SCENE_GRAPH_RENDERER_DEFAULT_ON_SURFACES) {
    if (
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
}): SceneGraphRendererFlags {
  if (input.hasEnabledStorageOverride) {
    return input.persistedFlags;
  }
  if (!isSceneGraphRendererDefaultOnSurface(input.surface)) {
    return input.persistedFlags;
  }
  return {
    ...input.persistedFlags,
    enabled: true,
  };
}
