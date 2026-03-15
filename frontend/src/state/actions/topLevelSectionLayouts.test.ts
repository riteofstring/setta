import {
  createProjectConfig,
  createViewModeConfig,
  type ProjectStateSingleConfigWithCompletedOpIds,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  createTopLevelSectionLayoutDict,
  getActiveViewModeTopLevelSections,
} from "./topLevelSectionLayouts";

describe("getActiveViewModeTopLevelSections", () => {
  it("merges base and active-view layouts when both exist", () => {
    const projectState = {
      projectConfig: createProjectConfig({
        id: "project-1",
        activeViewModeId: "view-mode-1",
        topLevelSections: {
          "section-a": { x: 0, y: 0, zIndex: 1, w: null, h: null },
          "section-b": { x: 20, y: 20, zIndex: 2, w: null, h: null },
        },
        viewModes: {
          "view-mode-1": createViewModeConfig({
            id: "view-mode-1",
            topLevelSections: {
              "section-b": { x: 40, y: 50, zIndex: 4, w: 80, h: 90 },
              "section-c": { x: 60, y: 70, zIndex: 5, w: null, h: null },
            },
          }),
        },
      }),
    } as ProjectStateSingleConfigWithCompletedOpIds["projectState"];

    expect(getActiveViewModeTopLevelSections(projectState)).toEqual({
      "section-a": { x: 0, y: 0, zIndex: 1, w: null, h: null },
      "section-b": { x: 40, y: 50, zIndex: 4, w: 80, h: 90 },
      "section-c": { x: 60, y: 70, zIndex: 5, w: null, h: null },
    });
  });
});

describe("createTopLevelSectionLayoutDict", () => {
  it("preserves hidden sections from existing layouts", () => {
    const sectionVisible = "section-visible";
    const sectionHidden = "section-hidden";
    const sections = {
      [sectionVisible]: { id: sectionVisible },
      [sectionHidden]: { id: sectionHidden },
    } as ProjectStateSingleConfigWithCompletedOpIds["projectState"]["sections"];
    const nodeInternals = new Map([
      [
        sectionVisible,
        {
          id: sectionVisible,
          position: { x: 10, y: 20 },
          width: 120,
          height: 140,
          zIndex: 2,
          tempZIndex: 2,
        },
      ],
    ]);
    const existingLayouts = {
      [sectionVisible]: { x: 0, y: 0, zIndex: 0, w: 100, h: 100 },
      [sectionHidden]: { x: 300, y: 400, zIndex: 0, w: 200, h: 180 },
    };

    const result = createTopLevelSectionLayoutDict(
      sections,
      nodeInternals,
      existingLayouts,
    );

    expect(result[sectionVisible]).toEqual({
      x: 10,
      y: 20,
      zIndex: 2,
      w: 120,
      h: 140,
    });
    expect(result[sectionHidden]).toEqual(existingLayouts[sectionHidden]);
  });
});
