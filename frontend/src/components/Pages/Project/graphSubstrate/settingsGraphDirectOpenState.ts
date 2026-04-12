export type SettingsGraphDirectOpenPhase =
  | "bootstrap_shell_loading"
  | "app_router_loading"
  | "settings_loading"
  | "backend_loading"
  | "project_loading"
  | "surface_ready"
  | "app_shell_without_surface";

export type SettingsGraphDirectOpenSnapshot = {
  appRouterLoadingMounted: boolean;
  appShellMounted: boolean;
  backendReady: boolean | null;
  globalLoadingMounted: boolean;
  graphSurfaceMounted: boolean;
  projectSurfaceLoadingMounted: boolean;
  settingsContentMounted: boolean;
  settingsLoaded: boolean | null;
};

export function resolveSettingsGraphGlobalLoadingPhase(args: {
  backendReady: boolean;
  settingsLoaded: boolean;
}): "backend_loading" | "settings_loading" {
  if (!args.settingsLoaded) {
    return "settings_loading";
  }
  if (!args.backendReady) {
    return "backend_loading";
  }
  return "backend_loading";
}

export function isSettingsGraphDirectOpenReady(
  snapshot: SettingsGraphDirectOpenSnapshot,
): boolean {
  return snapshot.graphSurfaceMounted || snapshot.settingsContentMounted;
}

export function resolveSettingsGraphDirectOpenPhase(
  snapshot: SettingsGraphDirectOpenSnapshot,
): SettingsGraphDirectOpenPhase {
  if (isSettingsGraphDirectOpenReady(snapshot)) {
    return "surface_ready";
  }
  if (snapshot.projectSurfaceLoadingMounted) {
    return "project_loading";
  }
  if (snapshot.globalLoadingMounted) {
    if (snapshot.settingsLoaded === false) {
      return "settings_loading";
    }
    if (snapshot.backendReady === false) {
      return "backend_loading";
    }
  }
  if (snapshot.appRouterLoadingMounted) {
    return "app_router_loading";
  }
  if (snapshot.appShellMounted) {
    return "app_shell_without_surface";
  }
  return "bootstrap_shell_loading";
}
