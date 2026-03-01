import type { SceneGraphRendererFlags } from "./flags";

export type SceneGraphRendererRolloutSurface = {
  projectConfigId: string;
  projectConfigName: string;
  activeViewModeName: string;
};

export type SceneGraphRendererRolloutDefaultOnReason =
  | "none"
  | "project_config_name_default"
  | "project_config_name_canary"
  | "project_config_id_default"
  | "project_config_id_canary"
  | "surface_exact_match";

const SCENE_GRAPH_RENDERER_DEFAULT_ON_PROJECT_CONFIG_NAMES: ReadonlySet<string> =
  new Set(["settings", "chief_quick"]);
const SCENE_GRAPH_RENDERER_DEFAULT_ON_PROJECT_CONFIG_IDS: ReadonlySet<string> =
  new Set();
const SCENE_GRAPH_RENDERER_DEFAULT_ON_SURFACES: readonly SceneGraphRendererRolloutSurface[] =
  [];

export function isSceneGraphRendererDefaultOnSurface(
  surface: SceneGraphRendererRolloutSurface,
  rolloutProjectConfigIds: readonly string[] = [],
  rolloutProjectConfigNames: readonly string[] = [],
): boolean {
  return (
    resolveSceneGraphRendererRolloutDefaultOnReason(
      surface,
      rolloutProjectConfigIds,
      rolloutProjectConfigNames,
    ) !== "none"
  );
}

export function resolveSceneGraphRendererRolloutDefaultOnReason(
  surface: SceneGraphRendererRolloutSurface,
  rolloutProjectConfigIds: readonly string[] = [],
  rolloutProjectConfigNames: readonly string[] = [],
): SceneGraphRendererRolloutDefaultOnReason {
  const projectConfigNameReason = resolveProjectConfigNameRolloutReason(
    surface.projectConfigName,
    rolloutProjectConfigNames,
  );
  if (projectConfigNameReason !== null) {
    return projectConfigNameReason;
  }
  const projectConfigIdReason = resolveProjectConfigIdRolloutReason(
    surface.projectConfigId,
    rolloutProjectConfigIds,
  );
  if (projectConfigIdReason !== null) {
    return projectConfigIdReason;
  }
  for (const candidateSurface of SCENE_GRAPH_RENDERER_DEFAULT_ON_SURFACES) {
    if (
      candidateSurface.projectConfigId === surface.projectConfigId &&
      candidateSurface.projectConfigName === surface.projectConfigName &&
      candidateSurface.activeViewModeName === surface.activeViewModeName
    ) {
      return "surface_exact_match";
    }
  }
  return "none";
}

export function resolveSceneGraphRendererRolloutFlags(input: {
  persistedFlags: SceneGraphRendererFlags;
  surface: SceneGraphRendererRolloutSurface;
  hasEnabledStorageOverride: boolean;
  rolloutProjectConfigIds: readonly string[];
  rolloutProjectConfigNames: readonly string[];
}): SceneGraphRendererFlags {
  if (input.hasEnabledStorageOverride) {
    return input.persistedFlags;
  }
  if (
    !isSceneGraphRendererDefaultOnSurface(
      input.surface,
      input.rolloutProjectConfigIds,
      input.rolloutProjectConfigNames,
    )
  ) {
    return input.persistedFlags;
  }
  return {
    ...input.persistedFlags,
    enabled: true,
  };
}

function resolveProjectConfigIdRolloutReason(
  projectConfigId: string,
  rolloutProjectConfigIds: readonly string[],
): SceneGraphRendererRolloutDefaultOnReason | null {
  if (SCENE_GRAPH_RENDERER_DEFAULT_ON_PROJECT_CONFIG_IDS.has(projectConfigId)) {
    return "project_config_id_default";
  }
  for (const candidateProjectConfigId of rolloutProjectConfigIds) {
    if (candidateProjectConfigId === projectConfigId) {
      return "project_config_id_canary";
    }
  }
  return null;
}

function resolveProjectConfigNameRolloutReason(
  projectConfigName: string,
  rolloutProjectConfigNames: readonly string[],
): SceneGraphRendererRolloutDefaultOnReason | null {
  if (
    SCENE_GRAPH_RENDERER_DEFAULT_ON_PROJECT_CONFIG_NAMES.has(projectConfigName)
  ) {
    return "project_config_name_default";
  }
  for (const candidateProjectConfigName of rolloutProjectConfigNames) {
    if (candidateProjectConfigName === projectConfigName) {
      return "project_config_name_canary";
    }
  }
  return null;
}
