import { describe, expect, it } from "vitest";
import { resolveSettingsGraphLaneHealthClassification } from "./settingsGraphLaneHealth";

describe("resolveSettingsGraphLaneHealthClassification", () => {
  it("keeps preflight unhealthy states authoritative", () => {
    expect(
      resolveSettingsGraphLaneHealthClassification({
        instrumentationMounted: false,
        mountedSceneSectionCount: 0,
        preflightStatus: "worktree_unhealthy",
        preflightSurfaceKind: null,
        surfacePresence: {
          canaryRootMounted: false,
          legacyPaneMounted: false,
        },
        targetSectionSurfaceKind: null,
        targetSectionVisible: false,
      }),
    ).toBe("worktree_unhealthy");
  });

  it("flags mixed canary and legacy roots as a renderer regression", () => {
    expect(
      resolveSettingsGraphLaneHealthClassification({
        instrumentationMounted: true,
        mountedSceneSectionCount: 46,
        preflightStatus: "ok",
        preflightSurfaceKind: "canary",
        surfacePresence: {
          canaryRootMounted: true,
          legacyPaneMounted: true,
        },
        targetSectionSurfaceKind: "canary",
        targetSectionVisible: true,
      }),
    ).toBe("renderer_regression");
  });

  it("returns healthy when the target stays visible on the expected surface", () => {
    expect(
      resolveSettingsGraphLaneHealthClassification({
        instrumentationMounted: true,
        mountedSceneSectionCount: 46,
        preflightStatus: "ok",
        preflightSurfaceKind: "canary",
        surfacePresence: {
          canaryRootMounted: true,
          legacyPaneMounted: false,
        },
        targetSectionSurfaceKind: "canary",
        targetSectionVisible: true,
      }),
    ).toBe("healthy");
  });
});
