import { describe, expect, it } from "vitest";
import {
  isSettingsGraphAppReady,
  isSettingsGraphProjectSurfaceLoading,
  resolveSettingsGraphSurfaceKind,
  shouldContinueWaitingForSettingsGraphAppReady,
} from "./settingsGraphSurfaceState";

describe("settingsGraphSurfaceState", () => {
  it("prefers the canary graph surface when both selectors are present", () => {
    expect(
      resolveSettingsGraphSurfaceKind({
        canaryRootMounted: true,
        legacyPaneMounted: true,
      }),
    ).toBe("canary");
  });

  it("returns null when neither graph surface selector is mounted", () => {
    expect(
      resolveSettingsGraphSurfaceKind({
        canaryRootMounted: false,
        legacyPaneMounted: false,
      }),
    ).toBeNull();
  });

  it("treats the titlebar plus visible settings content as app ready", () => {
    expect(
      isSettingsGraphAppReady({
        appShellMounted: true,
        canaryRootMounted: false,
        legacyPaneMounted: false,
        projectSurfaceLoadingMounted: false,
        settingsContentMounted: true,
      }),
    ).toBe(true);
  });

  it("keeps the app unready before the shell mounts", () => {
    expect(
      isSettingsGraphAppReady({
        appShellMounted: false,
        canaryRootMounted: true,
        legacyPaneMounted: false,
        projectSurfaceLoadingMounted: false,
        settingsContentMounted: true,
      }),
    ).toBe(false);
  });

  it("detects the direct settings loading surface before a graph root mounts", () => {
    expect(
      isSettingsGraphProjectSurfaceLoading({
        appShellMounted: true,
        canaryRootMounted: false,
        legacyPaneMounted: false,
        projectSurfaceLoadingMounted: true,
        settingsContentMounted: false,
      }),
    ).toBe(true);
  });

  it("does not treat the loading surface as active once graph content mounts", () => {
    expect(
      isSettingsGraphProjectSurfaceLoading({
        appShellMounted: true,
        canaryRootMounted: true,
        legacyPaneMounted: false,
        projectSurfaceLoadingMounted: true,
        settingsContentMounted: true,
      }),
    ).toBe(false);
  });

  it("stops polling when the latest snapshot is already ready at the timeout boundary", () => {
    expect(
      shouldContinueWaitingForSettingsGraphAppReady({
        deadlineMs: 1_000,
        nowMs: 1_000,
        snapshot: {
          appShellMounted: true,
          canaryRootMounted: false,
          legacyPaneMounted: true,
          projectSurfaceLoadingMounted: false,
          settingsContentMounted: true,
        },
      }),
    ).toBe(false);
  });

  it("keeps polling while the app is still unready before the timeout", () => {
    expect(
      shouldContinueWaitingForSettingsGraphAppReady({
        deadlineMs: 1_000,
        nowMs: 999,
        snapshot: {
          appShellMounted: true,
          canaryRootMounted: false,
          legacyPaneMounted: false,
          projectSurfaceLoadingMounted: true,
          settingsContentMounted: false,
        },
      }),
    ).toBe(true);
  });
});
