import {
  createNodesMapFromProjectConfigChildren,
  createTopLevelSectionLayoutDict,
  getCurrEffectiveSectionImpl,
  getDisplayedSectionIdToChildren,
  getSectionDescendants,
  getTopLevelSectionIdsForDisplay,
} from "state/actions/sectionInfos";
import { useLocalStorage, type ZustandProjectState } from "state/definitions";
import {
  createCodeSectionImpl,
  createCore,
  createDictSectionImpl,
  createProjectConfig,
  createSingletonSections,
  createTerminalSectionImpl,
  createVariant,
  SectionTypeEnum,
  type SingleConfig,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";

describe("createNodesMapFromProjectConfigChildren", () => {
  it("filters out hidden sections when not editing view modes", () => {
    const sectionVisible = "section-visible";
    const sectionHidden = "section-hidden";
    const sectionVisibleVariantId = "variant-visible";
    const sectionHiddenVariantId = "variant-hidden";
    const sectionVisibleImplId = "impl-visible";
    const sectionHiddenImplId = "impl-hidden";
    const viewModeId = "view-1";
    const layout = { x: 0, y: 0, zIndex: 0, w: 200, h: 160 };
    const projectConfig = createProjectConfig({
      id: "project-1",
      sectionVariantMap: {
        [sectionVisible]: sectionVisibleVariantId,
        [sectionHidden]: sectionHiddenVariantId,
      },
      topLevelSections: {
        [sectionVisible]: { ...layout },
        [sectionHidden]: { ...layout },
      },
      viewModes: {
        [viewModeId]: {
          id: viewModeId,
          name: "Visible Only",
          sortIndex: 0,
          isUserFacing: false,
          isTab: true,
          visibilityBySectionId: {
            [sectionVisible]: true,
            [sectionHidden]: false,
          },
          viewport: { x: 0, y: 0, zoom: 1 },
          viewportInitialized: false,
          topLevelSections: {
            [sectionVisible]: { ...layout },
            [sectionHidden]: { ...layout },
          },
        },
      },
      activeViewModeId: viewModeId,
      isEditingViewMode: false,
    });
    const projectState = {
      projectConfig,
      sections: {
        [sectionVisible]: createCore({ id: sectionVisible }),
        [sectionHidden]: createCore({ id: sectionHidden }),
      },
      sectionImpls: {
        [sectionVisibleImplId]: createTerminalSectionImpl({
          id: sectionVisibleImplId,
          type: SectionTypeEnum.Terminal,
        }),
        [sectionHiddenImplId]: createTerminalSectionImpl({
          id: sectionHiddenImplId,
          type: SectionTypeEnum.Terminal,
        }),
      },
      sectionVariants: {
        [sectionVisibleVariantId]: createVariant({
          id: sectionVisibleVariantId,
          impl: sectionVisibleImplId,
          nonPresetImpls: [],
        }),
        [sectionHiddenVariantId]: createVariant({
          id: sectionHiddenVariantId,
          impl: sectionHiddenImplId,
          nonPresetImpls: [],
        }),
      },
      codeObjs: {},
      codeObjImpls: {},
      codeObjVariants: {},
      artifactGroups: {},
      singletonSections: createSingletonSections(),
      parentSectionMap: {
        [sectionVisible]: null,
        [sectionHidden]: null,
      },
      shownParamIds: {},
      previewSectionVariantMap: {},
      requiredDecodedImages: [],
    } as ZustandProjectState;

    const nodesMap = createNodesMapFromProjectConfigChildren(
      projectState,
      new Map(),
    );

    expect(nodesMap.has(sectionVisible)).toBe(true);
    expect(nodesMap.has(sectionHidden)).toBe(false);
  });

  it("uses view mode layout when project layout is missing visible sections", () => {
    const sectionVisible = "section-visible";
    const sectionHidden = "section-hidden";
    const sectionVisibleVariantId = "variant-visible";
    const sectionHiddenVariantId = "variant-hidden";
    const sectionVisibleImplId = "impl-visible";
    const sectionHiddenImplId = "impl-hidden";
    const viewModeId = "view-1";
    const layout = { x: 0, y: 0, zIndex: 0, w: 200, h: 160 };
    const projectConfig = createProjectConfig({
      id: "project-1",
      sectionVariantMap: {
        [sectionVisible]: sectionVisibleVariantId,
        [sectionHidden]: sectionHiddenVariantId,
      },
      topLevelSections: {
        [sectionHidden]: { ...layout },
      },
      viewModes: {
        [viewModeId]: {
          id: viewModeId,
          name: "Visible Only",
          sortIndex: 0,
          isUserFacing: false,
          isTab: true,
          visibilityBySectionId: {
            [sectionVisible]: true,
            [sectionHidden]: false,
          },
          viewport: { x: 0, y: 0, zoom: 1 },
          viewportInitialized: false,
          topLevelSections: {
            [sectionVisible]: { ...layout },
            [sectionHidden]: { ...layout },
          },
        },
      },
      activeViewModeId: viewModeId,
      isEditingViewMode: false,
    });
    const projectState = {
      projectConfig,
      sections: {
        [sectionVisible]: createCore({ id: sectionVisible }),
        [sectionHidden]: createCore({ id: sectionHidden }),
      },
      sectionImpls: {
        [sectionVisibleImplId]: createTerminalSectionImpl({
          id: sectionVisibleImplId,
          type: SectionTypeEnum.Terminal,
        }),
        [sectionHiddenImplId]: createTerminalSectionImpl({
          id: sectionHiddenImplId,
          type: SectionTypeEnum.Terminal,
        }),
      },
      sectionVariants: {
        [sectionVisibleVariantId]: createVariant({
          id: sectionVisibleVariantId,
          impl: sectionVisibleImplId,
          nonPresetImpls: [],
        }),
        [sectionHiddenVariantId]: createVariant({
          id: sectionHiddenVariantId,
          impl: sectionHiddenImplId,
          nonPresetImpls: [],
        }),
      },
      codeObjs: {},
      codeObjImpls: {},
      codeObjVariants: {},
      artifactGroups: {},
      singletonSections: createSingletonSections(),
      parentSectionMap: {
        [sectionVisible]: null,
        [sectionHidden]: null,
      },
      shownParamIds: {},
      previewSectionVariantMap: {},
      requiredDecodedImages: [],
    } as ZustandProjectState;

    const nodesMap = createNodesMapFromProjectConfigChildren(
      projectState,
      new Map(),
    );

    expect(nodesMap.has(sectionVisible)).toBe(true);
    expect(nodesMap.has(sectionHidden)).toBe(false);
  });

  it("skips sections that are missing visibility in the active view mode", () => {
    const sectionVisible = "section-visible";
    const sectionMissingVisibility = "section-missing-visibility";
    const sectionVisibleVariantId = "variant-visible";
    const sectionMissingVisibilityVariantId = "variant-missing-visibility";
    const sectionVisibleImplId = "impl-visible";
    const sectionMissingVisibilityImplId = "impl-missing-visibility";
    const viewModeId = "view-1";
    const layout = { x: 0, y: 0, zIndex: 0, w: 200, h: 160 };
    const projectConfig = createProjectConfig({
      id: "project-1",
      sectionVariantMap: {
        [sectionVisible]: sectionVisibleVariantId,
        [sectionMissingVisibility]: sectionMissingVisibilityVariantId,
      },
      topLevelSections: {
        [sectionVisible]: { ...layout },
        [sectionMissingVisibility]: { ...layout },
      },
      viewModes: {
        [viewModeId]: {
          id: viewModeId,
          name: "Visible Only",
          sortIndex: 0,
          isUserFacing: false,
          isTab: true,
          visibilityBySectionId: {
            [sectionVisible]: true,
          },
          viewport: { x: 0, y: 0, zoom: 1 },
          viewportInitialized: false,
          topLevelSections: {
            [sectionVisible]: { ...layout },
            [sectionMissingVisibility]: { ...layout },
          },
        },
      },
      activeViewModeId: viewModeId,
      isEditingViewMode: false,
    });
    const projectState = {
      projectConfig,
      sections: {
        [sectionVisible]: createCore({ id: sectionVisible }),
        [sectionMissingVisibility]: createCore({
          id: sectionMissingVisibility,
        }),
      },
      sectionImpls: {
        [sectionVisibleImplId]: createTerminalSectionImpl({
          id: sectionVisibleImplId,
          type: SectionTypeEnum.Terminal,
        }),
        [sectionMissingVisibilityImplId]: createTerminalSectionImpl({
          id: sectionMissingVisibilityImplId,
          type: SectionTypeEnum.Terminal,
        }),
      },
      sectionVariants: {
        [sectionVisibleVariantId]: createVariant({
          id: sectionVisibleVariantId,
          impl: sectionVisibleImplId,
          nonPresetImpls: [],
        }),
        [sectionMissingVisibilityVariantId]: createVariant({
          id: sectionMissingVisibilityVariantId,
          impl: sectionMissingVisibilityImplId,
          nonPresetImpls: [],
        }),
      },
      codeObjs: {},
      codeObjImpls: {},
      codeObjVariants: {},
      artifactGroups: {},
      singletonSections: createSingletonSections(),
      parentSectionMap: {
        [sectionVisible]: null,
        [sectionMissingVisibility]: null,
      },
      shownParamIds: {},
      previewSectionVariantMap: {},
      requiredDecodedImages: [],
    } as ZustandProjectState;

    expect(() =>
      createNodesMapFromProjectConfigChildren(projectState, new Map()),
    ).not.toThrow();

    const nodesMap = createNodesMapFromProjectConfigChildren(
      projectState,
      new Map(),
    );
    expect(nodesMap.has(sectionVisible)).toBe(true);
    expect(nodesMap.has(sectionMissingVisibility)).toBe(false);
  });

  it("includes node type and derived style background for minimap rendering", () => {
    const sectionId = "section-visible";
    const variantId = "variant-visible";
    const implId = "impl-visible";
    const layout = { x: 0, y: 0, zIndex: 0, w: 200, h: 160 };
    useLocalStorage.setState({ darkMode: false });

    const projectState = {
      projectConfig: createProjectConfig({
        id: "project-1",
        sectionVariantMap: {
          [sectionId]: variantId,
        },
        topLevelSections: {
          [sectionId]: { ...layout },
        },
      }),
      sections: {
        [sectionId]: createCore({ id: sectionId }),
      },
      sectionImpls: {
        [implId]: createTerminalSectionImpl({
          id: implId,
          type: SectionTypeEnum.Terminal,
          styleColor: "#ff0000",
        }),
      },
      sectionVariants: {
        [variantId]: createVariant({
          id: variantId,
          impl: implId,
          nonPresetImpls: [],
        }),
      },
      codeObjs: {},
      codeObjImpls: {},
      codeObjVariants: {},
      artifactGroups: {},
      singletonSections: createSingletonSections(),
      parentSectionMap: {
        [sectionId]: null,
      },
      shownParamIds: {},
      previewSectionVariantMap: {},
      requiredDecodedImages: [],
    } as ZustandProjectState;

    const nodesMap = createNodesMapFromProjectConfigChildren(
      projectState,
      new Map(),
    );

    expect(nodesMap.get(sectionId)).toMatchObject({
      type: SectionTypeEnum.Terminal,
      style: {
        background: "#ffe0e0",
      },
    });
  });

  it("uses section size for outer shell dimensions instead of stale existing node dimensions", () => {
    const sectionId = "section-visible";
    const variantId = "variant-visible";
    const implId = "impl-visible";
    const projectState = {
      projectConfig: createProjectConfig({
        id: "project-1",
        sectionVariantMap: {
          [sectionId]: variantId,
        },
        topLevelSections: {
          [sectionId]: { x: 10, y: 20, zIndex: 3, w: 200, h: 160 },
        },
      }),
      sections: {
        [sectionId]: createCore({ id: sectionId }),
      },
      sectionImpls: {
        [implId]: createTerminalSectionImpl({
          id: implId,
          type: SectionTypeEnum.Terminal,
          size: { width: 200, height: 160 },
        }),
      },
      sectionVariants: {
        [variantId]: createVariant({
          id: variantId,
          impl: implId,
          nonPresetImpls: [],
        }),
      },
      codeObjs: {},
      codeObjImpls: {},
      codeObjVariants: {},
      artifactGroups: {},
      singletonSections: createSingletonSections(),
      parentSectionMap: {
        [sectionId]: null,
      },
      shownParamIds: {},
      previewSectionVariantMap: {},
      requiredDecodedImages: [],
    } as ZustandProjectState;

    const nodesMap = createNodesMapFromProjectConfigChildren(
      projectState,
      new Map([
        [
          sectionId,
          {
            id: sectionId,
            position: { x: 0, y: 0 },
            width: 999,
            height: 888,
            zIndex: 0,
            tempZIndex: 0,
          },
        ],
      ]),
    );

    expect(nodesMap.get(sectionId)).toMatchObject({
      position: { x: 10, y: 20 },
      width: 202,
      height: 162,
      zIndex: 3,
      tempZIndex: 3,
    });
  });

  it("resolves missing layout dimensions from section size and leaves auto dimensions intrinsic", () => {
    const sectionId = "settings-section__shortcuts";
    const variantId = "variant-visible";
    const implId = "impl-visible";
    const projectState = {
      projectConfig: createProjectConfig({
        id: "settings",
        sectionVariantMap: {
          [sectionId]: variantId,
        },
        topLevelSections: {
          [sectionId]: { x: 0, y: 0, zIndex: 0, w: null, h: null },
        },
      }),
      sections: {
        [sectionId]: createCore({ id: sectionId }),
      },
      sectionImpls: {
        [implId]: createDictSectionImpl({
          id: implId,
          type: SectionTypeEnum.Dict,
          size: { width: 550, height: "auto" },
        }),
      },
      sectionVariants: {
        [variantId]: createVariant({
          id: variantId,
          impl: implId,
          nonPresetImpls: [],
        }),
      },
      codeObjs: {},
      codeObjImpls: {},
      codeObjVariants: {},
      artifactGroups: {},
      singletonSections: createSingletonSections(),
      parentSectionMap: {
        [sectionId]: null,
      },
      shownParamIds: {},
      previewSectionVariantMap: {},
      requiredDecodedImages: [],
    } as ZustandProjectState;

    const nodesMap = createNodesMapFromProjectConfigChildren(
      projectState,
      new Map(),
    );

    expect(nodesMap.get(sectionId)).toMatchObject({
      width: 552,
      height: null,
    });
  });

  it("uses section size instead of stale persisted layout dimensions", () => {
    const sectionId = "settings-section__shortcuts";
    const variantId = "variant-visible";
    const implId = "impl-visible";
    const projectState = {
      projectConfig: createProjectConfig({
        id: "settings",
        sectionVariantMap: {
          [sectionId]: variantId,
        },
        topLevelSections: {
          [sectionId]: { x: 0, y: 0, zIndex: 0, w: 321, h: 1562 },
        },
      }),
      sections: {
        [sectionId]: createCore({ id: sectionId }),
      },
      sectionImpls: {
        [implId]: createDictSectionImpl({
          id: implId,
          type: SectionTypeEnum.Dict,
          size: { width: 550, height: "auto" },
        }),
      },
      sectionVariants: {
        [variantId]: createVariant({
          id: variantId,
          impl: implId,
          nonPresetImpls: [],
        }),
      },
      codeObjs: {},
      codeObjImpls: {},
      codeObjVariants: {},
      artifactGroups: {},
      singletonSections: createSingletonSections(),
      parentSectionMap: {
        [sectionId]: null,
      },
      shownParamIds: {},
      previewSectionVariantMap: {},
      requiredDecodedImages: [],
    } as ZustandProjectState;

    const nodesMap = createNodesMapFromProjectConfigChildren(
      projectState,
      new Map(),
    );

    expect(nodesMap.get(sectionId)).toMatchObject({
      width: 552,
      height: null,
    });
  });
});

describe("getTopLevelSectionIdsForDisplay", () => {
  it("filters top-level ids that cannot resolve to an effective impl", () => {
    const validSectionId = "section-valid";
    const missingVariantSectionId = "section-missing-variant";
    const validVariantId = "variant-valid";
    const validImplId = "impl-valid";
    const layout = { x: 0, y: 0, zIndex: 0, w: 200, h: 160 };

    const state = {
      projectConfig: createProjectConfig({
        id: "project-1",
        topLevelSections: {
          [validSectionId]: { ...layout },
          [missingVariantSectionId]: { ...layout },
        },
        sectionVariantMap: {
          [validSectionId]: validVariantId,
        },
      }),
      sections: {
        [validSectionId]: createCore({ id: validSectionId }),
        [missingVariantSectionId]: createCore({ id: missingVariantSectionId }),
      },
      sectionImpls: {
        [validImplId]: createTerminalSectionImpl({
          id: validImplId,
          type: SectionTypeEnum.Terminal,
        }),
      },
      sectionVariants: {
        [validVariantId]: createVariant({
          id: validVariantId,
          impl: validImplId,
          nonPresetImpls: [],
        }),
      },
      codeObjs: {},
      codeObjImpls: {},
      codeObjVariants: {},
      artifactGroups: {},
      singletonSections: createSingletonSections(),
      parentSectionMap: {
        [validSectionId]: null,
        [missingVariantSectionId]: null,
      },
      shownParamIds: {},
      previewSectionVariantMap: {},
      requiredDecodedImages: [],
    } as ZustandProjectState;

    expect(getTopLevelSectionIdsForDisplay(state)).toEqual([validSectionId]);
  });
});

describe("getDisplayedSectionIdToChildren", () => {
  it("skips top-level sections that cannot resolve to an effective impl", () => {
    const validSectionId = "section-valid";
    const missingVariantSectionId = "section-missing-variant";
    const validVariantId = "variant-valid";
    const validImplId = "impl-valid";
    const layout = { x: 0, y: 0, zIndex: 0, w: 200, h: 160 };

    const state = {
      projectConfig: createProjectConfig({
        id: "project-1",
        topLevelSections: {
          [validSectionId]: { ...layout },
          [missingVariantSectionId]: { ...layout },
        },
        sectionVariantMap: {
          [validSectionId]: validVariantId,
        },
      }),
      sections: {
        [validSectionId]: createCore({ id: validSectionId }),
        [missingVariantSectionId]: createCore({ id: missingVariantSectionId }),
      },
      sectionImpls: {
        [validImplId]: createTerminalSectionImpl({
          id: validImplId,
          type: SectionTypeEnum.Terminal,
        }),
      },
      sectionVariants: {
        [validVariantId]: createVariant({
          id: validVariantId,
          impl: validImplId,
          nonPresetImpls: [],
        }),
      },
      codeObjs: {},
      codeObjImpls: {},
      codeObjVariants: {},
      artifactGroups: {},
      singletonSections: createSingletonSections(),
      parentSectionMap: {
        [validSectionId]: null,
        [missingVariantSectionId]: null,
      },
      shownParamIds: {},
      previewSectionVariantMap: {},
      requiredDecodedImages: [],
    } as ZustandProjectState;

    // Missing variant links should not crash app readiness selectors.
    expect(() => getDisplayedSectionIdToChildren(state)).not.toThrow();
    expect(getDisplayedSectionIdToChildren(state)).toEqual({
      [validSectionId]: [],
    });
  });

  it("filters child ids that cannot resolve to an effective impl", () => {
    const parentSectionId = "section-parent";
    const validChildId = "section-child-valid";
    const missingChildVariantId = "section-child-missing-variant";
    const parentVariantId = "variant-parent";
    const validChildVariantId = "variant-child-valid";
    const parentImplId = "impl-parent";
    const validChildImplId = "impl-child-valid";
    const layout = { x: 0, y: 0, zIndex: 0, w: 200, h: 160 };

    const state = {
      projectConfig: createProjectConfig({
        id: "project-1",
        topLevelSections: {
          [parentSectionId]: { ...layout },
        },
        sectionVariantMap: {
          [parentSectionId]: parentVariantId,
          [validChildId]: validChildVariantId,
        },
      }),
      sections: {
        [parentSectionId]: createCore({
          id: parentSectionId,
          sharedModifier: {
            children: [validChildId, missingChildVariantId],
          },
        }),
        [validChildId]: createCore({ id: validChildId }),
        [missingChildVariantId]: createCore({ id: missingChildVariantId }),
      },
      sectionImpls: {
        [parentImplId]: createCodeSectionImpl({
          id: parentImplId,
          type: SectionTypeEnum.Code,
        }),
        [validChildImplId]: createTerminalSectionImpl({
          id: validChildImplId,
          type: SectionTypeEnum.Terminal,
        }),
      },
      sectionVariants: {
        [parentVariantId]: createVariant({
          id: parentVariantId,
          impl: parentImplId,
          nonPresetImpls: [],
        }),
        [validChildVariantId]: createVariant({
          id: validChildVariantId,
          impl: validChildImplId,
          nonPresetImpls: [],
        }),
      },
      codeObjs: {},
      codeObjImpls: {},
      codeObjVariants: {},
      artifactGroups: {},
      singletonSections: createSingletonSections(),
      parentSectionMap: {
        [parentSectionId]: null,
        [validChildId]: parentSectionId,
        [missingChildVariantId]: parentSectionId,
      },
      shownParamIds: {},
      previewSectionVariantMap: {},
      requiredDecodedImages: [],
    } as ZustandProjectState;

    // Invalid children are dropped so DnD and readiness selectors stay stable.
    expect(getDisplayedSectionIdToChildren(state)).toEqual({
      [parentSectionId]: [validChildId],
      [validChildId]: [],
    });
  });

  it("treats generated parent sections with empty children as childless", () => {
    const sectionId = "generated-section";
    const variantId = "generated-variant";
    const implId = "generated-impl";
    const layout = { x: 0, y: 0, zIndex: 0, w: 200, h: 160 };
    const generatedImpl = {
      ...createCodeSectionImpl({
        id: implId,
        code: "print('generated')",
        codeLanguage: "python",
      }),
      type: SectionTypeEnum.GenPythonCode,
      children: [],
      size: {
        width: 500,
        height: 150,
      },
    };

    const state = {
      projectConfig: createProjectConfig({
        id: "project-1",
        topLevelSections: {
          [sectionId]: { ...layout },
        },
        sectionVariantMap: {
          [sectionId]: variantId,
        },
      }),
      sections: {
        [sectionId]: createCore({ id: sectionId }),
      },
      sectionImpls: {
        [implId]: generatedImpl,
      },
      sectionVariants: {
        [variantId]: createVariant({
          id: variantId,
          impl: implId,
          nonPresetImpls: [],
        }),
      },
      codeObjs: {},
      codeObjImpls: {},
      codeObjVariants: {},
      artifactGroups: {},
      singletonSections: createSingletonSections(),
      parentSectionMap: {
        [sectionId]: null,
      },
      shownParamIds: {},
      previewSectionVariantMap: {},
      requiredDecodedImages: [],
    } as ZustandProjectState;

    expect(getDisplayedSectionIdToChildren(state)).toEqual({
      [sectionId]: [],
    });
    expect(getSectionDescendants(sectionId, state)).toEqual([sectionId]);
    expect(getCurrEffectiveSectionImpl(state, sectionId).size).toEqual({
      width: 500,
      height: 150,
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
    } as SingleConfig["sections"];
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

  it("keeps existing size and z-index when node measurements are missing", () => {
    const sectionId = "section-visible";
    const sections = {
      [sectionId]: { id: sectionId },
    } as SingleConfig["sections"];
    const nodeInternals = new Map([
      [
        sectionId,
        {
          id: sectionId,
          position: { x: 25, y: 35 },
          tempZIndex: 0,
        },
      ],
    ]);
    const existingLayouts = {
      [sectionId]: { x: 0, y: 0, zIndex: 4, w: 320, h: 180 },
    };

    const result = createTopLevelSectionLayoutDict(
      sections,
      nodeInternals,
      existingLayouts,
    );

    expect(result[sectionId]).toEqual({
      x: 25,
      y: 35,
      zIndex: 4,
      w: 320,
      h: 180,
    });
  });
});
