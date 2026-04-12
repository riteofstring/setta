import type { SettingsGraphSurfaceKind } from "./settingsGraphSurfaceState";

export type SettingsGraphLaneHealthClassification =
  | "healthy"
  | "reference_unhealthy"
  | "renderer_regression"
  | "worktree_unhealthy";

export function resolveSettingsGraphLaneHealthClassification(args: {
  instrumentationMounted: boolean;
  mountedSceneSectionCount: number;
  preflightStatus: "ok" | "reference_unhealthy" | "worktree_unhealthy";
  preflightSurfaceKind: SettingsGraphSurfaceKind | null;
  surfacePresence: {
    canaryRootMounted: boolean;
    legacyPaneMounted: boolean;
  };
  targetSectionSurfaceKind: SettingsGraphSurfaceKind | null;
  targetSectionVisible: boolean;
}): SettingsGraphLaneHealthClassification {
  if (args.preflightStatus !== "ok") {
    return args.preflightStatus;
  }

  if (
    args.surfacePresence.canaryRootMounted &&
    args.surfacePresence.legacyPaneMounted
  ) {
    return "renderer_regression";
  }

  if (args.targetSectionSurfaceKind !== args.preflightSurfaceKind) {
    return "renderer_regression";
  }

  if (!args.targetSectionVisible) {
    return "renderer_regression";
  }

  if (args.preflightSurfaceKind === "canary") {
    if (!args.instrumentationMounted) {
      return "renderer_regression";
    }
    if (args.mountedSceneSectionCount <= 0) {
      return "renderer_regression";
    }
  }

  return "healthy";
}
