import { createProjectConfig } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import { applyActiveViewMode, applyViewModeSortOrder } from "./viewModes";

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

  it("throws when an unknown id is provided", () => {
    const state = createStateWithViewModes();
    expect(() =>
      applyViewModeSortOrder(state, ["alpha-id", "beta-id", "missing-id"]),
    ).toThrow("View mode missing-id not found.");
  });
});

describe("applyActiveViewMode", () => {
  it("switches active view mode and preserves outgoing layout/viewport", () => {
    const state = createStateWithViewModes();
    state.projectConfig.topLevelSections = {
      sectionA: { x: 11, y: 22, zIndex: 3, w: 100, h: 50 },
    };
    state.projectConfig.viewport = { x: 3, y: 4, zoom: 1.4 };
    state.projectConfig.viewportInitialized = true;
    state.projectConfig.viewModes["beta-id"].topLevelSections = {
      sectionB: { x: 101, y: 202, zIndex: 1, w: 300, h: 150 },
    };
    state.projectConfig.viewModes["beta-id"].viewport = {
      x: 9,
      y: 8,
      zoom: 0.7,
    };
    state.projectConfig.viewModes["beta-id"].viewportInitialized = true;

    applyActiveViewMode(state, "beta-id");

    expect(state.projectConfig.activeViewModeId).toBe("beta-id");
    expect(state.projectConfig.topLevelSections).toEqual({
      sectionB: { x: 101, y: 202, zIndex: 1, w: 300, h: 150 },
    });
    expect(state.projectConfig.viewport).toEqual({ x: 9, y: 8, zoom: 0.7 });
    expect(state.projectConfig.viewportInitialized).toBe(true);
    expect(state.projectConfig.viewModes["alpha-id"].topLevelSections).toEqual({
      sectionA: { x: 11, y: 22, zIndex: 3, w: 100, h: 50 },
    });
    expect(state.projectConfig.viewModes["alpha-id"].viewport).toEqual({
      x: 3,
      y: 4,
      zoom: 1.4,
    });
    expect(state.projectConfig.viewModes["alpha-id"].viewportInitialized).toBe(
      true,
    );
  });

  it("clones current layout when the target view mode has no layout", () => {
    const state = createStateWithViewModes();
    state.projectConfig.topLevelSections = {
      sectionA: { x: 10, y: 20, zIndex: 0, w: 80, h: 40 },
    };
    state.projectConfig.viewModes["beta-id"].topLevelSections = {};

    applyActiveViewMode(state, "beta-id");

    expect(state.projectConfig.topLevelSections).toEqual({
      sectionA: { x: 10, y: 20, zIndex: 0, w: 80, h: 40 },
    });
    expect(state.projectConfig.viewModes["beta-id"].topLevelSections).toEqual({
      sectionA: { x: 10, y: 20, zIndex: 0, w: 80, h: 40 },
    });
    expect(state.projectConfig.viewModes["beta-id"].topLevelSections).not.toBe(
      state.projectConfig.viewModes["alpha-id"].topLevelSections,
    );
  });
});
