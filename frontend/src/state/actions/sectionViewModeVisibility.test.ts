import { type ZustandProjectState } from "state/definitions";
import {
  createCore,
  createProjectConfig,
  createSingletonSections,
  createTerminalSectionImpl,
  createVariant,
  SectionTypeEnum,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  getActiveViewModeConfig,
  getAncestorSameVisibility,
  getSectionShouldRender,
  getSectionViewModeVisibility,
  getSectionViewModeVisibilityIfPresent,
} from "./sectionViewModeVisibility";

function createVisibilityState({
  isEditingViewMode = false,
  visibilityBySectionId = {
    "section-root": true,
    "section-child": false,
    "section-grandchild": true,
  },
}: {
  isEditingViewMode?: boolean;
  visibilityBySectionId?: Record<string, boolean>;
} = {}): ZustandProjectState {
  const viewModeId = "view-mode-1";
  const sectionIds = ["section-root", "section-child", "section-grandchild"];
  const parentBySectionId: Record<string, string | null> = {
    "section-root": null,
    "section-child": "section-root",
    "section-grandchild": "section-child",
  };

  return {
    projectConfig: createProjectConfig({
      id: "project-1",
      activeViewModeId: viewModeId,
      isEditingViewMode,
      sectionVariantMap: Object.fromEntries(
        sectionIds.map((sectionId) => [sectionId, `${sectionId}-variant`]),
      ),
      viewModes: {
        [viewModeId]: {
          id: viewModeId,
          name: "View Mode",
          sortIndex: 0,
          isUserFacing: false,
          isTab: true,
          visibilityBySectionId,
          viewport: { x: 0, y: 0, zoom: 1 },
          viewportInitialized: false,
          topLevelSections: {
            "section-root": { x: 0, y: 0, zIndex: 0, w: 200, h: 150 },
          },
        },
      },
    }),
    sections: Object.fromEntries(
      sectionIds.map((sectionId) => [
        sectionId,
        createCore({
          id: sectionId,
          name: sectionId,
          variants: [`${sectionId}-variant`],
          defaultVariant: `${sectionId}-variant`,
          sharedModifier: {
            ...(parentBySectionId[sectionId]
              ? { parentId: parentBySectionId[sectionId] }
              : {}),
          },
          unsharedKeys: [],
        }),
      ]),
    ),
    sectionImpls: Object.fromEntries(
      sectionIds.map((sectionId) => [
        `${sectionId}-impl`,
        {
          ...createTerminalSectionImpl({
            id: `${sectionId}-impl`,
            type: SectionTypeEnum.Terminal,
          }),
          parentId: parentBySectionId[sectionId],
        },
      ]),
    ),
    sectionVariants: Object.fromEntries(
      sectionIds.map((sectionId) => [
        `${sectionId}-variant`,
        createVariant({
          id: `${sectionId}-variant`,
          name: sectionId,
          impl: `${sectionId}-impl`,
          nonPresetImpls: [],
        }),
      ]),
    ),
    codeObjs: {},
    codeObjImpls: {},
    codeObjVariants: {},
    artifactGroups: {},
    singletonSections: createSingletonSections(),
    parentSectionMap: parentBySectionId,
    shownParamIds: {},
    previewSectionVariantMap: {},
    requiredDecodedImages: [],
  } as ZustandProjectState;
}

describe("section view mode visibility", () => {
  it("returns the active view mode and section visibility metadata", () => {
    const state = createVisibilityState({ isEditingViewMode: true });

    expect(getActiveViewModeConfig(state).id).toBe("view-mode-1");
    expect(getSectionViewModeVisibility("section-child", state)).toEqual({
      visibility: false,
      isEditingViewMode: true,
    });
  });

  it("returns null for sections missing visibility in the active view mode", () => {
    const state = createVisibilityState({
      visibilityBySectionId: {
        "section-root": true,
      },
    });

    expect(
      getSectionViewModeVisibilityIfPresent("section-child", state),
    ).toBeNull();
  });

  it("reports whether any ancestor shares the same visibility", () => {
    const state = createVisibilityState();

    expect(getAncestorSameVisibility("section-grandchild", state)).toBe(true);
    expect(getAncestorSameVisibility("section-child", state)).toBe(false);
  });

  it("treats edit mode as always render while preserving hidden visibility", () => {
    expect(getSectionShouldRender(true, false)).toBe(true);
    expect(getSectionShouldRender(false, true)).toBe(true);
    expect(getSectionShouldRender(false, false)).toBe(false);
  });
});
