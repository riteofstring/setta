import type { Node } from "forks/xyflow/core/types";
import type { ZustandProjectState } from "state/definitions";
import { createProjectConfig } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  resolveActiveViewModeName,
  selectSettingsGraphSubstrateCanarySection,
  shouldUseSettingsGraphSubstrateCanary,
} from "./settingsGraphSubstrateCanaryModel";

function createProjectState(): ZustandProjectState {
  const projectConfig = createProjectConfig({
    id: "project-1",
    name: "settings",
  });
  projectConfig.activeViewModeId = "all-settings";
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
      "section-a": { id: "section-a", name: "A", type: "Code" },
      "section-b": { id: "section-b", name: "B", type: "Code" },
      hidden: { id: "hidden", name: "Hidden", type: "Code" },
    },
    sectionImpls: {},
    sectionVariants: {},
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

  it("selects the top-left visible canary section and prefers measured dimensions", () => {
    const state = createProjectState();
    const nodeInternals = new Map<string, Node>([
      [
        "section-b",
        {
          id: "section-b",
          position: { x: 120, y: 100 },
          width: 410,
          height: 260,
          zIndex: 1,
          tempZIndex: 1,
          type: "Code",
        },
      ],
    ]);

    expect(
      selectSettingsGraphSubstrateCanarySection(state, nodeInternals),
    ).toEqual({
      sectionId: "section-b",
      layout: { x: 120, y: 100, zIndex: 1, w: 320, h: 240 },
      width: 410,
      height: 260,
    });
  });
});
