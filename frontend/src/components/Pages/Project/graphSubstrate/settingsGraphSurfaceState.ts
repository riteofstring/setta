export type SettingsGraphSurfaceKind = "canary" | "legacy";

export type SettingsGraphProjectViewport = {
  x: number;
  y: number;
  zoom: number;
};

export type SettingsGraphSurfacePresenceSnapshot = {
  appShellMounted: boolean;
  canaryRootMounted: boolean;
  legacyPaneMounted: boolean;
  projectSurfaceLoadingMounted: boolean;
  settingsContentMounted: boolean;
};

export function resolveSettingsGraphSurfaceKind(
  snapshot: Pick<
    SettingsGraphSurfacePresenceSnapshot,
    "canaryRootMounted" | "legacyPaneMounted"
  >,
): SettingsGraphSurfaceKind | null {
  if (snapshot.canaryRootMounted) {
    return "canary";
  }
  if (snapshot.legacyPaneMounted) {
    return "legacy";
  }
  return null;
}

export function isSettingsGraphAppReady(
  snapshot: SettingsGraphSurfacePresenceSnapshot,
): boolean {
  return (
    snapshot.appShellMounted &&
    (snapshot.canaryRootMounted ||
      snapshot.legacyPaneMounted ||
      snapshot.settingsContentMounted)
  );
}

export function isSettingsGraphProjectSurfaceLoading(
  snapshot: SettingsGraphSurfacePresenceSnapshot,
): boolean {
  return (
    snapshot.appShellMounted &&
    snapshot.projectSurfaceLoadingMounted &&
    !snapshot.canaryRootMounted &&
    !snapshot.legacyPaneMounted &&
    !snapshot.settingsContentMounted
  );
}

export function shouldContinueWaitingForSettingsGraphAppReady(args: {
  deadlineMs: number;
  nowMs: number;
  snapshot: SettingsGraphSurfacePresenceSnapshot;
}): boolean {
  return (
    !isSettingsGraphAppReady(args.snapshot) && args.nowMs < args.deadlineMs
  );
}

export function resolveSettingsGraphSharedProjectViewport(args: {
  viewport: SettingsGraphProjectViewport | null;
  viewportInitialized: boolean;
}): SettingsGraphProjectViewport | null {
  if (!args.viewportInitialized || !args.viewport) {
    return null;
  }
  return args.viewport;
}
