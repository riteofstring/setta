import {
  createCodeSectionImpl,
  createCore,
  createGroupSectionImpl,
  createProjectConfig,
  createUserDefaultCodeSectionImpl,
  createUserDefaultGroupSectionImpl,
  createVariant,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  getActiveSectionUIIds,
  setActiveSectionUIIds,
} from "state/activeSectionSelection";
import {
  NULL_PROJECT_CONFIG_ID,
  useProjectState,
  useServerMode,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  clearActiveSectionIds,
  pruneActiveSectionIdsForViewMode,
  selectAll,
  setTopLevelNonGroupSectionsAsActive,
} from "./activeSections";

describe("activeSectionCommands", () => {
  beforeEach(() => {
    resetProjectStores();
    useServerMode.setState({
      mode: "app",
      modeResolved: true,
      modeError: null,
    });
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("clears the active section selection", () => {
    seedSections([
      { sectionId: "section-a", type: "Code" },
      { sectionId: "section-b", type: "Code" },
    ]);
    setActiveSectionUIIds(["section-a"]);

    clearActiveSectionIds();

    expect(getActiveSectionUIIds()).toEqual([]);
  });

  it("prunes hidden sections from the current view-mode selection", () => {
    seedSections([
      { sectionId: "section-a", type: "Code" },
      { sectionId: "section-b", type: "Code" },
    ]);
    useProjectState.setState((state) => {
      state.projectConfig.activeViewModeId = "view-mode-1";
      state.projectConfig.viewModes = {
        "view-mode-1": {
          id: "view-mode-1",
          name: "Mode",
          sortIndex: 0,
          isUserFacing: true,
          isTab: true,
          visibilityBySectionId: {
            "section-a": true,
            "section-b": false,
          },
          viewport: { x: 0, y: 0, zoom: 1 },
          viewportInitialized: false,
          topLevelSections: {},
        },
      };
    });
    setActiveSectionUIIds(["section-a", "section-b"]);

    pruneActiveSectionIdsForViewMode("view-mode-1", false);

    expect(getActiveSectionUIIds()).toEqual(["section-a"]);
  });

  it("selects only non-group top-level sections", () => {
    seedSections([
      { sectionId: "section-code", type: "Code" },
      { sectionId: "section-group", type: "Group" },
      { sectionId: "section-code-2", type: "Code" },
    ]);

    setTopLevelNonGroupSectionsAsActive();

    expect(getActiveSectionUIIds()).toEqual(["section-code", "section-code-2"]);
  });

  it("selects every section when multiple sections are already active", () => {
    seedSections([
      { sectionId: "section-a", type: "Code" },
      { sectionId: "section-b", type: "Code" },
      { sectionId: "section-c", type: "Code" },
    ]);
    setActiveSectionUIIds(["section-a", "section-b"]);

    selectAll();

    expect(getActiveSectionUIIds()).toEqual([
      "section-a",
      "section-b",
      "section-c",
    ]);
  });
});

function seedSections(
  sections: Array<{ sectionId: string; type: "Code" | "Group" }>,
): void {
  useProjectState.setState((state) => {
    state.projectConfig = createProjectConfig({
      ...state.projectConfig,
      id: NULL_PROJECT_CONFIG_ID,
      sectionVariantMap: {},
      topLevelSections: {},
    });
    state.sections = {};
    state.sectionImpls = {};
    state.sectionVariants = {};
    state.parentSectionMap = {};

    sections.forEach((section, index) => {
      const variantId = `variant-${section.sectionId}`;
      const implId = `impl-${section.sectionId}`;

      state.sections[section.sectionId] = createCore({ id: section.sectionId });
      state.parentSectionMap[section.sectionId] = null;
      state.projectConfig.sectionVariantMap[section.sectionId] = variantId;
      state.projectConfig.topLevelSections[section.sectionId] = {
        x: index * 200,
        y: index * 120,
        zIndex: index,
        w: 200,
        h: 160,
      };
      state.sectionVariants[variantId] = createVariant({
        id: variantId,
        impl: implId,
        nonPresetImpls: [implId],
        name: `variant-${section.sectionId}`,
      });
      state.sectionImpls[implId] =
        section.type === "Group"
          ? createGroupSectionImpl(createUserDefaultGroupSectionImpl(), {
              id: implId,
            })
          : createCodeSectionImpl(createUserDefaultCodeSectionImpl(), {
              id: implId,
            });
    });
  });
}
