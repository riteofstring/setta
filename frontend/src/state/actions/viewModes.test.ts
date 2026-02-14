import { createProjectConfig } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import { applyViewModeSortOrder } from "./viewModes";

function createStateWithViewModes() {
  const alphaId = "alpha-id";
  const betaId = "beta-id";
  const gammaId = "gamma-id";
  const projectConfig = createProjectConfig({
    id: "project-id",
    activeViewModeId: alphaId,
    viewModes: {
      [alphaId]: {
        id: alphaId,
        name: "Alpha",
        sortIndex: 0,
        isUserFacing: false,
        isTab: true,
        visibilityBySectionId: {},
        viewport: { x: 0, y: 0, zoom: 1 },
        viewportInitialized: false,
        topLevelSections: {},
      },
      [betaId]: {
        id: betaId,
        name: "Beta",
        sortIndex: 1,
        isUserFacing: false,
        isTab: true,
        visibilityBySectionId: {},
        viewport: { x: 0, y: 0, zoom: 1 },
        viewportInitialized: false,
        topLevelSections: {},
      },
      [gammaId]: {
        id: gammaId,
        name: "Gamma",
        sortIndex: 2,
        isUserFacing: false,
        isTab: false,
        visibilityBySectionId: {},
        viewport: { x: 0, y: 0, zoom: 1 },
        viewportInitialized: false,
        topLevelSections: {},
      },
    },
  });
  return {
    projectConfig,
  };
}

describe("applyViewModeSortOrder", () => {
  it("applies a complete ordered list of view mode ids", () => {
    const state = createStateWithViewModes();
    applyViewModeSortOrder(state, ["gamma-id", "alpha-id", "beta-id"]);

    expect(state.projectConfig.viewModes["gamma-id"].sortIndex).toBe(0);
    expect(state.projectConfig.viewModes["alpha-id"].sortIndex).toBe(1);
    expect(state.projectConfig.viewModes["beta-id"].sortIndex).toBe(2);
  });

  it("throws when the ordered list is incomplete", () => {
    const state = createStateWithViewModes();
    expect(() =>
      applyViewModeSortOrder(state, ["alpha-id", "beta-id"]),
    ).toThrow("orderedViewModeIds must include every view mode exactly once.");
  });

  it("throws when duplicate ids are provided", () => {
    const state = createStateWithViewModes();
    expect(() =>
      applyViewModeSortOrder(state, ["alpha-id", "alpha-id", "gamma-id"]),
    ).toThrow("orderedViewModeIds contains duplicates.");
  });
});
