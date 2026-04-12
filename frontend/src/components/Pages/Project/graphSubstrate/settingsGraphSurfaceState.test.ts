import { describe, expect, it } from "vitest";
import {
  isSettingsGraphAppReady,
  resolveSettingsGraphSurfaceKind,
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
        settingsContentMounted: true,
      }),
    ).toBe(false);
  });
});
