import type { ZustandProjectState } from "state/definitions";
import {
  createCodeSectionImpl,
  createCore,
  createProjectConfig,
  createUserDefaultCodeSectionImpl,
  createVariant,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  resolveActiveViewModeName,
  selectSettingsGraphSubstrateCanaryLayoutSections,
  selectSettingsGraphSubstrateCanarySections,
  shouldUseSettingsGraphSubstrateCanary,
} from "./settingsGraphSubstrateCanaryModel";

function createProjectState(): ZustandProjectState {
  const projectConfig = createProjectConfig({
    id: "project-1",
    name: "settings",
  });
  projectConfig.activeViewModeId = "all-settings";
  projectConfig.sectionVariantMap = {
    "section-a": "variant-a",
    "section-b": "variant-b",
    hidden: "variant-hidden",
  };
  projectConfig.viewModes = {
    "all-settings": {
      id: "all-settings",
      name: "All Settings",
      visibilityBySectionId: {
        "section-a": true,
        "section-b": true,
        hidden: false,
      },
      topLevelSections: {
        "section-a": { x: 500, y: 200, zIndex: 2, w: 240, h: 160 },
        "section-b": { x: 120, y: 100, zIndex: 1, w: 320, h: 240 },
        hidden: { x: 80, y: 40, zIndex: 0, w: 180, h: 120 },
      },
      isUserFacing: false,
    },
  };
  return {
    projectConfig,
    sections: {
      "section-a": createCore({
        id: "section-a",
        name: "A",
        variants: ["variant-a"],
        defaultVariant: "variant-a",
      }),
      "section-b": createCore({
        id: "section-b",
        name: "B",
        variants: ["variant-b"],
        defaultVariant: "variant-b",
      }),
      hidden: createCore({
        id: "hidden",
        name: "Hidden",
        variants: ["variant-hidden"],
        defaultVariant: "variant-hidden",
      }),
    },
    sectionVariants: {
      "variant-a": createVariant({
        id: "variant-a",
        impl: "impl-a",
        nonPresetImpls: [],
      }),
      "variant-b": createVariant({
        id: "variant-b",
        impl: "impl-b",
        nonPresetImpls: [],
      }),
      "variant-hidden": createVariant({
        id: "variant-hidden",
        impl: "impl-hidden",
        nonPresetImpls: [],
      }),
    },
    sectionImpls: {
      "impl-a": createCodeSectionImpl(createUserDefaultCodeSectionImpl(), {
        id: "impl-a",
        positionAndSizeLocked: false,
      }),
      "impl-b": createCodeSectionImpl(createUserDefaultCodeSectionImpl(), {
        id: "impl-b",
        positionAndSizeLocked: true,
      }),
      "impl-hidden": createCodeSectionImpl(createUserDefaultCodeSectionImpl(), {
        id: "impl-hidden",
        positionAndSizeLocked: false,
      }),
    },
    codeObjs: {},
    codeObjImpls: {},
    codeObjVariants: {},
    artifactGroups: {},
    singletonSections: {
      Default: null,
      Home: null,
      GlobalVariables: null,
      Overview: null,
      ProjectChat: null,
    },
    parentSectionMap: {},
    shownParamIds: {},
    projectChatWindowing: {
      auxView: null,
      bottomDock: null,
      windows: {},
      hiddenWindows: {},
      activeWindowId: null,
      pendingWindowId: null,
      maximizedWindowId: null,
      openSurfaceIds: [],
    },
    previewSectionVariantMap: {},
    requiredDecodedImages: [],
  };
}

describe("settingsGraphSubstrateCanaryModel", () => {
  it("enables the canary only for the settings All Settings surface", () => {
    expect(
      shouldUseSettingsGraphSubstrateCanary("settings", "All Settings"),
    ).toBe(true);
    expect(shouldUseSettingsGraphSubstrateCanary("settings", "Core")).toBe(
      false,
    );
    expect(
      shouldUseSettingsGraphSubstrateCanary("project", "All Settings"),
    ).toBe(false);
  });

  it("resolves the active view mode name from project state", () => {
    const state = createProjectState();
    expect(resolveActiveViewModeName(state)).toBe("All Settings");
  });

  it("returns no canary layout sections outside the settings All Settings route", () => {
    const state = createProjectState();
    state.projectConfig.name = "project";

    expect(selectSettingsGraphSubstrateCanaryLayoutSections(state)).toEqual([]);
  });

  it("selects all visible canary sections in legacy display order while only keeping locked layout size authoritative", () => {
    const state = createProjectState();

    expect(selectSettingsGraphSubstrateCanarySections(state)).toEqual([
      {
        sectionId: "section-a",
        position: { x: 500, y: 200 },
        zIndex: 2,
        tempZIndex: 2,
        width: null,
        height: null,
        positionAndSizeLocked: false,
      },
      {
        sectionId: "section-b",
        position: { x: 120, y: 100 },
        zIndex: 1,
        tempZIndex: 1,
        width: 320,
        height: 240,
        positionAndSizeLocked: true,
      },
    ]);
  });

  it("keeps layout z-order authoritative until the scene snapshot applies transient drag ownership", () => {
    const state = createProjectState();
    state.projectConfig.viewModes["all-settings"].topLevelSections[
      "section-a"
    ] = {
      x: 760,
      y: 420,
      zIndex: 8,
      w: 240,
      h: 160,
    };

    expect(selectSettingsGraphSubstrateCanarySections(state)).toEqual([
      {
        sectionId: "section-a",
        position: { x: 760, y: 420 },
        zIndex: 8,
        tempZIndex: 8,
        width: null,
        height: null,
        positionAndSizeLocked: false,
      },
      {
        sectionId: "section-b",
        position: { x: 120, y: 100 },
        zIndex: 1,
        tempZIndex: 1,
        width: 320,
        height: 240,
        positionAndSizeLocked: true,
      },
    ]);
  });
});
