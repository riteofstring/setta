import { describe, expect, it } from "vitest";
import {
  isSettingsGraphDirectOpenReady,
  resolveSettingsGraphDirectOpenPhase,
  resolveSettingsGraphGlobalLoadingPhase,
  type SettingsGraphDirectOpenSnapshot,
} from "./settingsGraphDirectOpenState";

describe("settingsGraphDirectOpenState", () => {
  function createSnapshot(
    overrides: Partial<SettingsGraphDirectOpenSnapshot> = {},
  ): SettingsGraphDirectOpenSnapshot {
    return {
      appRouterLoadingMounted: false,
      appShellMounted: false,
      backendReady: null,
      globalLoadingMounted: false,
      graphSurfaceMounted: false,
      projectSurfaceLoadingMounted: false,
      settingsContentMounted: false,
      settingsLoaded: null,
      ...overrides,
    };
  }

  it("reports settings loading before backend loading while the global shell is still blocked on settings", () => {
    expect(
      resolveSettingsGraphDirectOpenPhase(
        createSnapshot({
          appShellMounted: true,
          backendReady: false,
          globalLoadingMounted: true,
          settingsLoaded: false,
        }),
      ),
    ).toBe("settings_loading");
  });

  it("reports backend loading once settings are present but backend init is still pending", () => {
    expect(
      resolveSettingsGraphDirectOpenPhase(
        createSnapshot({
          appShellMounted: true,
          backendReady: false,
          globalLoadingMounted: true,
          settingsLoaded: true,
        }),
      ),
    ).toBe("backend_loading");
  });

  it("prefers project loading after the global shell clears", () => {
    expect(
      resolveSettingsGraphDirectOpenPhase(
        createSnapshot({
          appShellMounted: true,
          projectSurfaceLoadingMounted: true,
        }),
      ),
    ).toBe("project_loading");
  });

  it("reports app router loading before the shell mounts", () => {
    expect(
      resolveSettingsGraphDirectOpenPhase(
        createSnapshot({
          appRouterLoadingMounted: true,
        }),
      ),
    ).toBe("app_router_loading");
  });

  it("reports ready once graph content mounts", () => {
    const snapshot = createSnapshot({
      appShellMounted: true,
      graphSurfaceMounted: true,
    });
    expect(isSettingsGraphDirectOpenReady(snapshot)).toBe(true);
    expect(resolveSettingsGraphDirectOpenPhase(snapshot)).toBe("surface_ready");
  });

  it("uses a stable explicit phase for the global loading shell", () => {
    expect(
      resolveSettingsGraphGlobalLoadingPhase({
        backendReady: true,
        settingsLoaded: false,
      }),
    ).toBe("settings_loading");
    expect(
      resolveSettingsGraphGlobalLoadingPhase({
        backendReady: false,
        settingsLoaded: true,
      }),
    ).toBe("backend_loading");
  });
});
