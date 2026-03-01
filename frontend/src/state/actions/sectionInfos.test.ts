import { useReactFlow } from "forks/xyflow/core/store";
import * as chatMergeUtils from "state/actions/chatMergeUtils";
import {
  applyActiveViewModeProjectStatePatch,
  applyAppDefinitionProjectStatePatch,
  applyCodeObjsProjectStatePatch,
  applyProjectConfigProjectStatePatch,
  applyProjectStateOpStatusPatch,
  applySectionImplProjectStatePatch,
  applySectionImplsProjectStatePatch,
  applyStructuralProjectStatePatch,
  createNodesMapFromProjectConfigChildren,
  createTopLevelSectionLayoutDict,
  getAttachedTerminalParentIdForTerminalSection,
  getCurrEffectiveSectionImpl,
  getCurrShownParamIds,
  getDisplayedSectionIdToChildren,
  getEmbeddedAttachedTerminalForCodeSection,
  getEmbeddedAttachedTerminalParentIdForTerminalSection,
  getProjectStateRevision,
  getSectionIsHorizontalOrientation,
  getTopLevelSectionIdsForDisplay,
  processProjectStateUpdateFromBackend,
  setCurrEffectiveCodeObjImplValueIfPresent,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import { resetStreamingTracker } from "state/aiStreamingTracker";
import {
  useAppDefinition,
  useMisc,
  useNodeInternals,
  usePendingOperations,
  useProjectState,
  type ZustandProjectState,
} from "state/definitions";
import {
  ChatRoleEnum,
  createCallableSectionImpl,
  createChatSectionImpl,
  createCodeParamCodeObjImpl,
  createCodeSectionImpl,
  createCore,
  createListRootSectionImpl,
  createMessageTextContent,
  createProjectConfig,
  createSingletonSections,
  createTerminalSectionImpl,
  createUserDefaultCallableSectionImpl,
  createUserDefaultChatSectionImpl,
  createUserDefaultCodeParamCodeObjImpl,
  createUserDefaultListRootSectionImpl,
  createVariant,
  isBaseChildlessCodeObjImpl,
  ListRootViewModeEnum,
  SectionTypeEnum,
  type ProjectStateSingleConfigWithCompletedOpIds,
  type ShownParamIds,
  type ViewModeConfig,
} from "utils/generatedTypes";
import { describe, expect, it, vi } from "vitest";

describe("getSectionIsHorizontalOrientation", () => {
  it("treats list root kanban view as horizontal", () => {
    const sectionId = "list-root-1";
    const variantId = "variant-1";
    const implId = "impl-1";
    useProjectState.setState({
      projectConfig: createProjectConfig({
        id: "project-1",
        sectionVariantMap: { [sectionId]: variantId },
      }),
      sections: {},
      sectionImpls: {
        [implId]: createListRootSectionImpl(
          createUserDefaultListRootSectionImpl(),
          {
            id: implId,
            viewMode: ListRootViewModeEnum.kanban,
          },
        ),
      },
      sectionVariants: {
        [variantId]: createVariant({
          id: variantId,
          name: "Variant",
          impl: implId,
          nonPresetImpls: [],
        }),
      },
      codeObjs: {},
      codeObjImpls: {},
      codeObjVariants: {},
      artifactGroups: {},
      singletonSections: createSingletonSections(),
      parentSectionMap: { [sectionId]: null },
      shownParamIds: {},
      previewSectionVariantMap: {},
      requiredDecodedImages: [],
    } as ZustandProjectState);

    expect(getSectionIsHorizontalOrientation(sectionId)).toBe(true);
  });
});

describe("getCurrShownParamIds", () => {
  it("returns pinned and unpinned entries for the active variant", () => {
    const sectionId = "section-1";
    const variantId = "variant-1";
    const shown: ShownParamIds = {
      pinned: {
        requiredParamIdsToPaths: {},
        topLevelParamIds: ["param-a"],
      },
      unpinned: {
        requiredParamIdsToPaths: { "param-a": ["param-a"] },
        topLevelParamIds: ["param-a"],
      },
    };
    const state = {
      projectConfig: createProjectConfig({
        id: "project-1",
        sectionVariantMap: { [sectionId]: variantId },
      }),
      sections: {},
      sectionImpls: {},
      sectionVariants: {},
      codeObjs: {},
      codeObjImpls: {},
      codeObjVariants: {},
      artifactGroups: {},
      singletonSections: createSingletonSections(),
      parentSectionMap: {},
      shownParamIds: { [variantId]: shown },
      previewSectionVariantMap: {},
      requiredDecodedImages: [],
    } as ZustandProjectState;

    const pinned = getCurrShownParamIds(state, sectionId, true);
    const unpinned = getCurrShownParamIds(state, sectionId, false);

    expect(pinned.topLevelParamIds).toEqual(["param-a"]);
    expect(unpinned.topLevelParamIds).toEqual(["param-a"]);
  });

  it("uses preview variants when requested", () => {
    const sectionId = "section-1";
    const variantId = "variant-1";
    const previewVariantId = "variant-preview";
    const state = {
      projectConfig: createProjectConfig({
        id: "project-1",
        sectionVariantMap: { [sectionId]: variantId },
      }),
      sections: {},
      sectionImpls: {},
      sectionVariants: {},
      codeObjs: {},
      codeObjImpls: {},
      codeObjVariants: {},
      artifactGroups: {},
      singletonSections: createSingletonSections(),
      parentSectionMap: {},
      shownParamIds: {
        [variantId]: {
          pinned: {
            requiredParamIdsToPaths: {},
            topLevelParamIds: ["param-a"],
          },
          unpinned: {
            requiredParamIdsToPaths: { "param-a": ["param-a"] },
            topLevelParamIds: ["param-a"],
          },
        },
        [previewVariantId]: {
          pinned: {
            requiredParamIdsToPaths: {},
            topLevelParamIds: ["param-b"],
          },
          unpinned: {
            requiredParamIdsToPaths: { "param-b": ["param-b"] },
            topLevelParamIds: ["param-b"],
          },
        },
      },
      previewSectionVariantMap: { [sectionId]: previewVariantId },
      requiredDecodedImages: [],
    } as ZustandProjectState;

    const unpinned = getCurrShownParamIds(state, sectionId, false, true);

    expect(unpinned.topLevelParamIds).toEqual(["param-b"]);
  });

  it("falls back to the active variant when preview variant ids are stale", () => {
    const sectionId = "section-1";
    const variantId = "variant-1";
    const stalePreviewVariantId = "variant-stale";
    const state = {
      projectConfig: createProjectConfig({
        id: "project-1",
        sectionVariantMap: { [sectionId]: variantId },
      }),
      sections: {},
      sectionImpls: {},
      sectionVariants: {
        [variantId]: createVariant({
          id: variantId,
          impl: "impl-1",
          nonPresetImpls: [],
        }),
      },
      codeObjs: {},
      codeObjImpls: {},
      codeObjVariants: {},
      artifactGroups: {},
      singletonSections: createSingletonSections(),
      parentSectionMap: {},
      shownParamIds: {
        [variantId]: {
          pinned: {
            requiredParamIdsToPaths: {},
            topLevelParamIds: ["param-a"],
          },
          unpinned: {
            requiredParamIdsToPaths: { "param-a": ["param-a"] },
            topLevelParamIds: ["param-a"],
          },
        },
      },
      previewSectionVariantMap: { [sectionId]: stalePreviewVariantId },
      requiredDecodedImages: [],
    } as ZustandProjectState;

    const unpinned = getCurrShownParamIds(state, sectionId, false, true);

    expect(unpinned.topLevelParamIds).toEqual(["param-a"]);
  });

  it("falls back to the active variant when preview shown-param ids are missing", () => {
    const sectionId = "section-1";
    const variantId = "variant-1";
    const previewVariantId = "variant-preview";
    const state = {
      projectConfig: createProjectConfig({
        id: "project-1",
        sectionVariantMap: { [sectionId]: variantId },
      }),
      sections: {},
      sectionImpls: {},
      sectionVariants: {
        [variantId]: createVariant({
          id: variantId,
          impl: "impl-1",
          nonPresetImpls: [],
        }),
        [previewVariantId]: createVariant({
          id: previewVariantId,
          impl: "impl-2",
          nonPresetImpls: [],
        }),
      },
      codeObjs: {},
      codeObjImpls: {},
      codeObjVariants: {},
      artifactGroups: {},
      singletonSections: createSingletonSections(),
      parentSectionMap: {},
      shownParamIds: {
        [variantId]: {
          pinned: {
            requiredParamIdsToPaths: {},
            topLevelParamIds: ["param-a"],
          },
          unpinned: {
            requiredParamIdsToPaths: { "param-a": ["param-a"] },
            topLevelParamIds: ["param-a"],
          },
        },
      },
      previewSectionVariantMap: { [sectionId]: previewVariantId },
      requiredDecodedImages: [],
    } as ZustandProjectState;

    const unpinned = getCurrShownParamIds(state, sectionId, false, true);

    expect(unpinned.topLevelParamIds).toEqual(["param-a"]);
  });
});

describe("getCurrEffectiveSectionImpl", () => {
  it("reuses cached effective objects when impl and modifier refs are unchanged", () => {
    const sectionId = "section-1";
    const variantId = "variant-1";
    const implId = "chat-impl-1";
    const state = {
      projectConfig: createProjectConfig({
        id: "project-1",
        sectionVariantMap: { [sectionId]: variantId },
      }),
      sections: {
        [sectionId]: createCore({
          id: sectionId,
          sharedModifier: {
            inputText: "shared",
          },
          unsharedKeys: [],
        }),
      },
      sectionImpls: {
        [implId]: createChatSectionImpl({
          id: implId,
          type: SectionTypeEnum.Chat,
          inputText: "base",
        }),
      },
      sectionVariants: {
        [variantId]: createVariant({
          id: variantId,
          impl: implId,
          modifier: {
            inputText: "variant",
          },
          nonPresetImpls: [implId],
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

    const first = getCurrEffectiveSectionImpl(state, sectionId);
    const second = getCurrEffectiveSectionImpl(state, sectionId);

    expect(first).toBe(second);
    expect(first.inputText).toBe("variant");

    state.sectionVariants[variantId].modifier = {
      inputText: "updated",
    };
    const third = getCurrEffectiveSectionImpl(state, sectionId);

    expect(third).not.toBe(first);
    expect(third.inputText).toBe("updated");
  });

  it("returns updated values immediately after in-place effective impl mutations", () => {
    const sectionId = "section-cache-mutation";
    const variantId = "variant-cache-mutation";
    const implId = "chat-impl-cache-mutation";
    const state = {
      projectConfig: createProjectConfig({
        id: "project-1",
        sectionVariantMap: { [sectionId]: variantId },
      }),
      sections: {
        [sectionId]: createCore({
          id: sectionId,
          sharedModifier: {},
          unsharedKeys: [],
        }),
      },
      sectionImpls: {
        [implId]: createChatSectionImpl({
          id: implId,
          type: SectionTypeEnum.Chat,
          inputText: "base",
        }),
      },
      sectionVariants: {
        [variantId]: createVariant({
          id: variantId,
          impl: implId,
          modifier: {},
          nonPresetImpls: [implId],
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

    expect(getCurrEffectiveSectionImpl(state, sectionId).inputText).toBe(
      "base",
    );

    setCurrEffectiveSectionImplValue<"ChatSection">(state, sectionId, {
      inputText: "updated",
    });

    expect(getCurrEffectiveSectionImpl(state, sectionId).inputText).toBe(
      "updated",
    );
  });
});

describe("attached terminal helper lookups", () => {
  const codeSectionId = "code-1";
  const terminalSectionId = "terminal-1";
  const codeVariantId = "code-variant-1";
  const terminalVariantId = "terminal-variant-1";
  const codeImplId = "code-impl-1";
  const terminalImplId = "terminal-impl-1";

  function createStateForEmbeddedLookup(
    codeChildren: string[],
  ): ZustandProjectState {
    const sectionVariantMap = {
      [codeSectionId]: codeVariantId,
      [terminalSectionId]: terminalVariantId,
    };
    return {
      projectConfig: createProjectConfig({
        id: "project-1",
        sectionVariantMap,
      }),
      sections: {
        [codeSectionId]: createCore({
          id: codeSectionId,
          name: "Code Section",
          variants: [codeVariantId],
          defaultVariant: codeVariantId,
          sharedModifier: {
            attachedTerminalSectionId: terminalSectionId,
            children: codeChildren,
          },
          unsharedKeys: [],
        }),
        [terminalSectionId]: createCore({
          id: terminalSectionId,
          name: "Terminal Section",
          variants: [terminalVariantId],
          defaultVariant: terminalVariantId,
          sharedModifier: {},
          unsharedKeys: [],
        }),
      },
      sectionImpls: {
        [codeImplId]: createCodeSectionImpl({
          id: codeImplId,
          type: SectionTypeEnum.Code,
        }),
        [terminalImplId]: createTerminalSectionImpl({
          id: terminalImplId,
          type: SectionTypeEnum.Terminal,
          isMinimized: false,
        }),
      },
      sectionVariants: {
        [codeVariantId]: createVariant({
          id: codeVariantId,
          name: "Code Variant",
          impl: codeImplId,
          nonPresetImpls: [],
        }),
        [terminalVariantId]: createVariant({
          id: terminalVariantId,
          name: "Terminal Variant",
          impl: terminalImplId,
          nonPresetImpls: [],
        }),
      },
      codeObjs: {},
      codeObjImpls: {},
      codeObjVariants: {},
      artifactGroups: {},
      singletonSections: createSingletonSections(),
      parentSectionMap: {
        [codeSectionId]: null,
        [terminalSectionId]: codeSectionId,
      },
      shownParamIds: {},
      previewSectionVariantMap: {},
      requiredDecodedImages: [],
    } as ZustandProjectState;
  }

  it("returns embedded attachment details for a single attached terminal child", () => {
    const state = createStateForEmbeddedLookup([terminalSectionId]);

    expect(
      getAttachedTerminalParentIdForTerminalSection(state, terminalSectionId),
    ).toBe(codeSectionId);
    expect(
      getEmbeddedAttachedTerminalParentIdForTerminalSection(
        state,
        terminalSectionId,
      ),
    ).toBe(codeSectionId);
    expect(
      getEmbeddedAttachedTerminalForCodeSection(state, codeSectionId),
    ).toEqual({
      attachedTerminalId: terminalSectionId,
      isTerminalMinimized: false,
    });
  });

  it("treats second-child terminals as attached but not embedded", () => {
    const state = createStateForEmbeddedLookup([
      terminalSectionId,
      "section-2",
    ]);

    expect(
      getAttachedTerminalParentIdForTerminalSection(state, terminalSectionId),
    ).toBe(codeSectionId);
    expect(
      getEmbeddedAttachedTerminalParentIdForTerminalSection(
        state,
        terminalSectionId,
      ),
    ).toBeNull();
    expect(
      getEmbeddedAttachedTerminalForCodeSection(state, codeSectionId),
    ).toBeNull();
  });
});

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

describe("processProjectStateUpdateFromBackend", () => {
  it("skips completeness scoring when simple merge conditions already apply", () => {
    const scoreSpy = vi.spyOn(chatMergeUtils, "getMessageCompletenessScore");
    resetStreamingTracker();

    const sectionId = "section-1";
    const variantId = "variant-1";
    const implId = "impl-1";
    const chatId = "chat-1";

    const sectionCore = createCore({
      id: sectionId,
      name: "Chat",
      variants: [variantId],
      defaultVariant: variantId,
    });
    const sectionVariant = createVariant({
      id: variantId,
      name: "Chat Variant",
      impl: implId,
      nonPresetImpls: [],
    });
    const baseImpl = createChatSectionImpl(
      createUserDefaultChatSectionImpl({ chatId }),
      {
        id: implId,
        chatId,
      },
    );
    const currentImpl = {
      ...baseImpl,
      messages: [
        {
          id: "msg-1",
          role: ChatRoleEnum.user,
          content: [createMessageTextContent({ text: "First" })],
          attachments: [],
        },
        {
          id: "msg-2",
          role: ChatRoleEnum.assistant,
          content: [createMessageTextContent({ text: "Second" })],
          attachments: [],
          tool_calls: null,
        },
      ],
      toolCallArguments: {},
      inputText: "",
      waitingForResponse: false,
    };
    const incomingImpl = {
      ...baseImpl,
      messages: [
        {
          id: "msg-1",
          role: ChatRoleEnum.user,
          content: [createMessageTextContent({ text: "First" })],
          attachments: [],
        },
      ],
      toolCallArguments: {},
      inputText: "",
      waitingForResponse: false,
    };

    const projectConfig = createProjectConfig({
      id: "project-1",
      sectionVariantMap: { [sectionId]: variantId },
    });

    useProjectState.setState({
      projectConfig,
      sections: { [sectionId]: sectionCore },
      sectionImpls: { [implId]: currentImpl },
      sectionVariants: { [variantId]: sectionVariant },
      codeObjs: {},
      codeObjImpls: {},
      codeObjVariants: {},
      artifactGroups: {},
      singletonSections: createSingletonSections(),
      parentSectionMap: {},
      shownParamIds: {},
      previewSectionVariantMap: {},
      requiredDecodedImages: [],
    });
    usePendingOperations.setState({ pending: [] });
    useNodeInternals.setState({ x: new Map() });
    useReactFlow.setState({
      transform: [0, 0, 1],
      fitViewOnInit: false,
      fitViewOnInitDone: true,
    });

    const update: ProjectStateSingleConfigWithCompletedOpIds = {
      projectState: {
        projectConfig,
        sections: { [sectionId]: sectionCore },
        sectionImpls: { [implId]: incomingImpl },
        sectionVariants: { [variantId]: sectionVariant },
        codeObjs: {},
        codeObjImpls: {},
        codeObjVariants: {},
        artifactGroups: {},
        singletonSections: createSingletonSections(),
        parentSectionMap: {},
        shownParamIds: {},
        requiredDecodedImages: [],
        genCodeBinding: null,
      },
      completedOpIds: [],
      pendingOpIds: [],
    };

    processProjectStateUpdateFromBackend(update);

    expect(scoreSpy).not.toHaveBeenCalled();
    scoreSpy.mockRestore();
  });

  it("does not throw when pending param optimistic updates target removed sections", () => {
    const projectId = "project-1";
    const sectionId = "section-1";
    const sectionVariantId = "section-variant-1";
    const sectionImplId = "section-impl-1";
    const paramId = "param-1";
    const paramVariantId = "param-variant-1";
    const paramImplId = "param-impl-1";

    // Start from a normal section+param shape and keep one pending param update.
    useProjectState.setState({
      projectConfig: createProjectConfig({
        id: projectId,
        sectionVariantMap: { [sectionId]: sectionVariantId },
        topLevelSections: {
          [sectionId]: { x: 0, y: 0, zIndex: 0, w: 220, h: 160 },
        },
      }),
      sections: {
        [sectionId]: createCore({
          id: sectionId,
          variants: [sectionVariantId],
          defaultVariant: sectionVariantId,
        }),
      },
      sectionImpls: {
        [sectionImplId]: createCallableSectionImpl(
          createUserDefaultCallableSectionImpl(),
          {
            id: sectionImplId,
            codeObjVariantMap: {
              [paramId]: paramVariantId,
            },
          },
        ),
      },
      sectionVariants: {
        [sectionVariantId]: createVariant({
          id: sectionVariantId,
          impl: sectionImplId,
          nonPresetImpls: [],
        }),
      },
      codeObjs: {
        [paramId]: createCore({
          id: paramId,
          name: "param-1",
          variants: [paramVariantId],
          defaultVariant: paramVariantId,
        }),
      },
      codeObjImpls: {
        [paramImplId]: createCodeParamCodeObjImpl(
          createUserDefaultCodeParamCodeObjImpl(),
          {
            id: paramImplId,
            value: "before",
          },
        ),
      },
      codeObjVariants: {
        [paramVariantId]: createVariant({
          id: paramVariantId,
          impl: paramImplId,
          nonPresetImpls: [],
        }),
      },
      artifactGroups: {},
      singletonSections: createSingletonSections(),
      parentSectionMap: { [sectionId]: null },
      shownParamIds: {},
      previewSectionVariantMap: {},
      requiredDecodedImages: [],
    });
    useNodeInternals.setState({ x: new Map() });
    useReactFlow.setState({
      transform: [0, 0, 1],
      fitViewOnInit: false,
      fitViewOnInitDone: true,
    });
    usePendingOperations.setState({
      pending: [
        {
          opId: "op-param-update",
          acknowledged: false,
          apply: (state) => {
            setCurrEffectiveCodeObjImplValueIfPresent<"BaseChildlessCodeObj">(
              state,
              sectionId,
              paramId,
              {
                value: "after",
              },
            );
          },
        },
      ],
    });

    const backendUpdate: ProjectStateSingleConfigWithCompletedOpIds = {
      // Simulate undo/redo applying a snapshot where the edited section is gone.
      projectState: {
        projectConfig: createProjectConfig({
          id: projectId,
          sectionVariantMap: {},
          topLevelSections: {},
          activeIds: [],
        }),
        sections: {},
        sectionImpls: {},
        sectionVariants: {},
        codeObjs: {},
        codeObjImpls: {},
        codeObjVariants: {},
        artifactGroups: {},
        singletonSections: createSingletonSections(),
        parentSectionMap: {},
        shownParamIds: {},
        requiredDecodedImages: [],
        genCodeBinding: null,
      },
      completedOpIds: [],
      pendingOpIds: [],
    };

    expect(() =>
      processProjectStateUpdateFromBackend(backendUpdate),
    ).not.toThrow();
    expect(useProjectState.getState().sections).toEqual({});
  });

  it("applies viewport updates to the react flow store", () => {
    const sectionId = "section-1";
    const viewModeId = "view-1";
    const layout = { x: 0, y: 0, zIndex: 0, w: 200, h: 160 };
    const viewMode: ViewModeConfig = {
      id: viewModeId,
      name: "View A",
      sortIndex: 0,
      isUserFacing: false,
      isTab: true,
      visibilityBySectionId: { [sectionId]: true },
      viewport: { x: 0, y: 0, zoom: 1 },
      viewportInitialized: true,
      topLevelSections: { [sectionId]: { ...layout } },
    };

    const initialConfig = createProjectConfig({
      id: "project-1",
      topLevelSections: { [sectionId]: { ...layout } },
      viewModes: { [viewModeId]: viewMode },
      activeViewModeId: viewModeId,
      viewport: { x: 0, y: 0, zoom: 1 },
      viewportInitialized: true,
    });

    useProjectState.setState({
      projectConfig: initialConfig,
      sections: {},
      sectionImpls: {},
      sectionVariants: {},
      codeObjs: {},
      codeObjImpls: {},
      codeObjVariants: {},
      artifactGroups: {},
      singletonSections: createSingletonSections(),
      parentSectionMap: {},
      shownParamIds: {},
      previewSectionVariantMap: {},
      requiredDecodedImages: [],
    });
    usePendingOperations.setState({ pending: [] });
    useNodeInternals.setState({ x: new Map() });
    useReactFlow.setState({
      transform: [0, 0, 1],
      fitViewOnInit: false,
      fitViewOnInitDone: true,
    });

    const nextConfig = createProjectConfig({
      id: "project-1",
      topLevelSections: { [sectionId]: { ...layout } },
      viewModes: { [viewModeId]: viewMode },
      activeViewModeId: viewModeId,
      viewport: { x: 10, y: -20, zoom: 1.5 },
      viewportInitialized: true,
    });

    const update: ProjectStateSingleConfigWithCompletedOpIds = {
      projectState: {
        projectConfig: nextConfig,
        sections: {},
        sectionImpls: {},
        sectionVariants: {},
        codeObjs: {},
        codeObjImpls: {},
        codeObjVariants: {},
        artifactGroups: {},
        singletonSections: createSingletonSections(),
        parentSectionMap: {},
        shownParamIds: {},
        requiredDecodedImages: [],
        genCodeBinding: null,
      },
      completedOpIds: [],
      pendingOpIds: [],
    };

    processProjectStateUpdateFromBackend(update);

    const reactFlowState = useReactFlow.getState();
    expect(reactFlowState.transform).toEqual([10, -20, 1.5]);
    expect(reactFlowState.fitViewOnInit).toBe(false);
    expect(reactFlowState.fitViewOnInitDone).toBe(true);
  });

  it("fits view to visible sections when viewport is unset", () => {
    const sectionVisible = "section-visible";
    const sectionHidden = "section-hidden";
    const viewModeId = "view-1";
    const layout = { x: 0, y: 0, zIndex: 0, w: 200, h: 160 };
    const viewMode: ViewModeConfig = {
      id: viewModeId,
      name: "Visible View",
      sortIndex: 0,
      isUserFacing: false,
      isTab: true,
      visibilityBySectionId: {
        [sectionVisible]: true,
        [sectionHidden]: false,
      },
      viewport: null,
      viewportInitialized: false,
      topLevelSections: {
        [sectionVisible]: { ...layout },
        [sectionHidden]: { ...layout },
      },
    };

    const projectConfig = createProjectConfig({
      id: "project-1",
      topLevelSections: {
        [sectionVisible]: { ...layout },
        [sectionHidden]: { ...layout },
      },
      viewModes: { [viewModeId]: viewMode },
      activeViewModeId: viewModeId,
      viewport: { x: 0, y: 0, zoom: 1 },
      viewportInitialized: true,
    });

    useProjectState.setState({
      projectConfig,
      sections: {},
      sectionImpls: {},
      sectionVariants: {},
      codeObjs: {},
      codeObjImpls: {},
      codeObjVariants: {},
      artifactGroups: {},
      singletonSections: createSingletonSections(),
      parentSectionMap: {},
      shownParamIds: {},
      previewSectionVariantMap: {},
      requiredDecodedImages: [],
    });
    usePendingOperations.setState({ pending: [] });
    useNodeInternals.setState({ x: new Map() });
    useReactFlow.setState({
      fitViewOnInit: false,
      fitViewOnInitDone: true,
      fitViewOnInitOptions: undefined,
    });

    const update: ProjectStateSingleConfigWithCompletedOpIds = {
      projectState: {
        projectConfig: {
          ...projectConfig,
          viewport: null,
          viewportInitialized: false,
        },
        sections: {},
        sectionImpls: {},
        sectionVariants: {},
        codeObjs: {},
        codeObjImpls: {},
        codeObjVariants: {},
        artifactGroups: {},
        singletonSections: createSingletonSections(),
        parentSectionMap: {},
        shownParamIds: {},
        requiredDecodedImages: [],
        genCodeBinding: null,
      },
      completedOpIds: [],
      pendingOpIds: [],
    };

    processProjectStateUpdateFromBackend(update);

    const reactFlowState = useReactFlow.getState();
    expect(reactFlowState.fitViewOnInit).toBe(true);
    expect(reactFlowState.fitViewOnInitDone).toBe(false);
    expect(reactFlowState.fitViewOnInitOptions?.nodes).toEqual([
      { id: sectionVisible },
    ]);
  });

  it("fits view when active view mode changes with no viewport", () => {
    const sectionVisible = "section-visible";
    const sectionHidden = "section-hidden";
    const viewModeAId = "view-a";
    const viewModeBId = "view-b";
    const layout = { x: 0, y: 0, zIndex: 0, w: 200, h: 160 };
    const viewModeA: ViewModeConfig = {
      id: viewModeAId,
      name: "View A",
      sortIndex: 0,
      isUserFacing: false,
      isTab: true,
      visibilityBySectionId: {
        [sectionVisible]: true,
        [sectionHidden]: true,
      },
      viewport: null,
      viewportInitialized: false,
      topLevelSections: {
        [sectionVisible]: { ...layout },
        [sectionHidden]: { ...layout },
      },
    };
    const viewModeB: ViewModeConfig = {
      id: viewModeBId,
      name: "View B",
      sortIndex: 1,
      isUserFacing: false,
      isTab: true,
      visibilityBySectionId: {
        [sectionVisible]: true,
        [sectionHidden]: false,
      },
      viewport: null,
      viewportInitialized: false,
      topLevelSections: {
        [sectionVisible]: { ...layout },
        [sectionHidden]: { ...layout },
      },
    };

    const projectConfig = createProjectConfig({
      id: "project-1",
      topLevelSections: {
        [sectionHidden]: { ...layout },
      },
      viewModes: {
        [viewModeAId]: viewModeA,
        [viewModeBId]: viewModeB,
      },
      activeViewModeId: viewModeAId,
      viewport: null,
      viewportInitialized: false,
    });

    useProjectState.setState({
      projectConfig,
      sections: {},
      sectionImpls: {},
      sectionVariants: {},
      codeObjs: {},
      codeObjImpls: {},
      codeObjVariants: {},
      artifactGroups: {},
      singletonSections: createSingletonSections(),
      parentSectionMap: {},
      shownParamIds: {},
      previewSectionVariantMap: {},
      requiredDecodedImages: [],
    });
    usePendingOperations.setState({ pending: [] });
    useNodeInternals.setState({ x: new Map() });
    useReactFlow.setState({
      fitViewOnInit: false,
      fitViewOnInitDone: true,
      fitViewOnInitOptions: undefined,
    });

    const update: ProjectStateSingleConfigWithCompletedOpIds = {
      projectState: {
        projectConfig: {
          ...projectConfig,
          activeViewModeId: viewModeBId,
          viewport: null,
          viewportInitialized: false,
        },
        sections: {},
        sectionImpls: {},
        sectionVariants: {},
        codeObjs: {},
        codeObjImpls: {},
        codeObjVariants: {},
        artifactGroups: {},
        singletonSections: createSingletonSections(),
        parentSectionMap: {},
        shownParamIds: {},
        requiredDecodedImages: [],
        genCodeBinding: null,
      },
      completedOpIds: [],
      pendingOpIds: [],
    };

    processProjectStateUpdateFromBackend(update);

    const reactFlowState = useReactFlow.getState();
    expect(reactFlowState.fitViewOnInit).toBe(true);
    expect(reactFlowState.fitViewOnInitDone).toBe(false);
    expect(reactFlowState.fitViewOnInitOptions?.nodes).toEqual([
      { id: sectionVisible },
    ]);
  });

  it("requests node dimension updates when switching view modes without a viewport", () => {
    const sectionVisible = "section-visible";
    const sectionHidden = "section-hidden";
    const viewModeAId = "view-a";
    const viewModeBId = "view-b";
    const layout = { x: 0, y: 0, zIndex: 0, w: 200, h: 160 };
    const viewModeA: ViewModeConfig = {
      id: viewModeAId,
      name: "View A",
      sortIndex: 0,
      isUserFacing: false,
      isTab: true,
      visibilityBySectionId: {
        [sectionVisible]: true,
        [sectionHidden]: true,
      },
      viewport: null,
      viewportInitialized: false,
      topLevelSections: {
        [sectionVisible]: { ...layout },
        [sectionHidden]: { ...layout },
      },
    };
    const viewModeB: ViewModeConfig = {
      id: viewModeBId,
      name: "View B",
      sortIndex: 1,
      isUserFacing: false,
      isTab: true,
      visibilityBySectionId: {
        [sectionVisible]: true,
        [sectionHidden]: false,
      },
      viewport: null,
      viewportInitialized: false,
      topLevelSections: {
        [sectionVisible]: { ...layout },
        [sectionHidden]: { ...layout },
      },
    };

    const projectConfig = createProjectConfig({
      id: "project-1",
      topLevelSections: {
        [sectionHidden]: { ...layout },
      },
      viewModes: {
        [viewModeAId]: viewModeA,
        [viewModeBId]: viewModeB,
      },
      activeViewModeId: viewModeAId,
      viewport: null,
      viewportInitialized: false,
    });

    useProjectState.setState({
      projectConfig,
      sections: {},
      sectionImpls: {},
      sectionVariants: {},
      codeObjs: {},
      codeObjImpls: {},
      codeObjVariants: {},
      artifactGroups: {},
      singletonSections: createSingletonSections(),
      parentSectionMap: {},
      shownParamIds: {},
      previewSectionVariantMap: {},
      requiredDecodedImages: [],
    });
    usePendingOperations.setState({ pending: [] });
    useNodeInternals.setState({ x: new Map() });
    useReactFlow.setState({
      fitViewOnInit: false,
      fitViewOnInitDone: true,
      fitViewOnInitOptions: undefined,
    });
    useMisc.setState({
      numDisplayedCodeAreas: 0,
      numInitializedCodeAreas: 0,
      requestUpdateNodeDimensions: false,
    });

    const update: ProjectStateSingleConfigWithCompletedOpIds = {
      projectState: {
        projectConfig: {
          ...projectConfig,
          activeViewModeId: viewModeBId,
          viewport: null,
          viewportInitialized: false,
        },
        sections: {},
        sectionImpls: {},
        sectionVariants: {},
        codeObjs: {},
        codeObjImpls: {},
        codeObjVariants: {},
        artifactGroups: {},
        singletonSections: createSingletonSections(),
        parentSectionMap: {},
        shownParamIds: {},
        requiredDecodedImages: [],
        genCodeBinding: null,
      },
      completedOpIds: [],
      pendingOpIds: [],
    };

    processProjectStateUpdateFromBackend(update);

    expect(useMisc.getState().requestUpdateNodeDimensions).toBe(true);
  });

  it("stores project-state revisions from backend snapshots", () => {
    const projectConfig = createProjectConfig({
      id: "project-1",
      sectionVariantMap: {},
      topLevelSections: {},
      activeIds: [],
    });
    useProjectState.setState({
      projectConfig,
      sections: {},
      sectionImpls: {},
      sectionVariants: {},
      codeObjs: {},
      codeObjImpls: {},
      codeObjVariants: {},
      artifactGroups: {},
      singletonSections: createSingletonSections(),
      parentSectionMap: {},
      shownParamIds: {},
      previewSectionVariantMap: {},
      requiredDecodedImages: [],
    });
    usePendingOperations.setState({ pending: [] });
    useNodeInternals.setState({ x: new Map() });

    processProjectStateUpdateFromBackend({
      projectState: {
        projectConfig,
        sections: {},
        sectionImpls: {},
        sectionVariants: {},
        codeObjs: {},
        codeObjImpls: {},
        codeObjVariants: {},
        artifactGroups: {},
        singletonSections: createSingletonSections(),
        parentSectionMap: {},
        shownParamIds: {},
        requiredDecodedImages: [],
        genCodeBinding: null,
      },
      completedOpIds: [],
      pendingOpIds: [],
      projectStateRevision: 17,
    });

    expect(getProjectStateRevision("project-1")).toBe(17);
  });

  it("applies op-status patches and updates revision tracking", () => {
    const projectConfig = createProjectConfig({
      id: "project-1",
      sectionVariantMap: {},
      topLevelSections: {},
      activeIds: [],
    });
    useProjectState.setState({
      projectConfig,
      sections: {},
      sectionImpls: {},
      sectionVariants: {},
      codeObjs: {},
      codeObjImpls: {},
      codeObjVariants: {},
      artifactGroups: {},
      singletonSections: createSingletonSections(),
      parentSectionMap: {},
      shownParamIds: {},
      previewSectionVariantMap: {},
      requiredDecodedImages: [],
    });
    usePendingOperations.setState({
      pending: [
        {
          opId: "op-complete",
          acknowledged: false,
          apply: () => {},
        },
        {
          opId: "op-pending",
          acknowledged: false,
          apply: () => {},
        },
        {
          opId: "op-local",
          acknowledged: true,
          apply: () => {},
        },
      ],
    });

    const applied = applyProjectStateOpStatusPatch({
      projectConfigId: "project-1",
      previousProjectStateRevision: 90,
      projectStateRevision: 90,
      completedOpIds: ["op-complete"],
      pendingOpIds: ["op-pending"],
    });

    expect(applied).toBe(true);
    expect(usePendingOperations.getState().pending).toEqual([
      {
        opId: "op-pending",
        acknowledged: true,
        apply: expect.any(Function),
      },
      {
        opId: "op-local",
        acknowledged: true,
        apply: expect.any(Function),
      },
    ]);
    expect(getProjectStateRevision("project-1")).toBe(90);
  });

  it("applies active-view-mode patches and updates revision tracking", () => {
    const viewModeAId = "view-a";
    const viewModeBId = "view-b";
    const projectConfig = createProjectConfig({
      id: "project-1",
      activeViewModeId: viewModeAId,
      viewport: { x: 0, y: 0, zoom: 1 },
      viewportInitialized: true,
      topLevelSections: {},
      viewModes: {
        [viewModeAId]: {
          id: viewModeAId,
          name: "View A",
          sortIndex: 0,
          isUserFacing: false,
          isTab: true,
          visibilityBySectionId: {},
          viewport: { x: 0, y: 0, zoom: 1 },
          viewportInitialized: true,
          topLevelSections: {},
        },
        [viewModeBId]: {
          id: viewModeBId,
          name: "View B",
          sortIndex: 1,
          isUserFacing: false,
          isTab: true,
          visibilityBySectionId: {},
          viewport: { x: 42, y: -9, zoom: 1.25 },
          viewportInitialized: true,
          topLevelSections: {},
        },
      },
      sectionVariantMap: {},
      activeIds: [],
    });
    useProjectState.setState({
      projectConfig,
      sections: {},
      sectionImpls: {},
      sectionVariants: {},
      codeObjs: {},
      codeObjImpls: {},
      codeObjVariants: {},
      artifactGroups: {},
      singletonSections: createSingletonSections(),
      parentSectionMap: {},
      shownParamIds: {},
      previewSectionVariantMap: {},
      requiredDecodedImages: [],
    });
    usePendingOperations.setState({ pending: [] });
    useNodeInternals.setState({ x: new Map() });
    useReactFlow.setState({
      transform: [0, 0, 1],
      fitViewOnInit: false,
      fitViewOnInitDone: true,
    });

    const applied = applyActiveViewModeProjectStatePatch({
      projectConfigId: "project-1",
      activeViewModeId: viewModeBId,
      previousProjectStateRevision: 11,
      projectStateRevision: 12,
      completedOpIds: [],
      pendingOpIds: [],
    });

    expect(applied).toBe(true);
    expect(useProjectState.getState().projectConfig.activeViewModeId).toBe(
      viewModeBId,
    );
    expect(useProjectState.getState().projectConfig.viewport).toEqual({
      x: 42,
      y: -9,
      zoom: 1.25,
    });
    expect(getProjectStateRevision("project-1")).toBe(12);
  });

  it("applies project-config patches and updates revision tracking", () => {
    const viewModeAId = "view-a";
    const initialProjectConfig = createProjectConfig({
      id: "project-1",
      activeViewModeId: viewModeAId,
      viewport: { x: 0, y: 0, zoom: 1 },
      viewportInitialized: true,
      topLevelSections: {},
      viewModes: {
        [viewModeAId]: {
          id: viewModeAId,
          name: "View A",
          sortIndex: 0,
          isUserFacing: false,
          isTab: true,
          visibilityBySectionId: {},
          viewport: { x: 0, y: 0, zoom: 1 },
          viewportInitialized: true,
          topLevelSections: {},
        },
      },
      sectionVariantMap: {},
      activeIds: [],
      isEditingViewMode: false,
    });
    useProjectState.setState({
      projectConfig: initialProjectConfig,
      sections: {},
      sectionImpls: {},
      sectionVariants: {},
      codeObjs: {},
      codeObjImpls: {},
      codeObjVariants: {},
      artifactGroups: {},
      singletonSections: createSingletonSections(),
      parentSectionMap: {},
      shownParamIds: {},
      previewSectionVariantMap: {},
      requiredDecodedImages: [],
    });
    usePendingOperations.setState({ pending: [] });
    useNodeInternals.setState({ x: new Map() });

    const nextProjectConfig = createProjectConfig({
      ...initialProjectConfig,
      id: "project-1",
      isEditingViewMode: true,
      viewModes: {
        ...initialProjectConfig.viewModes,
        [viewModeAId]: {
          ...initialProjectConfig.viewModes[viewModeAId],
          name: "Renamed View",
        },
      },
    });
    const applied = applyProjectConfigProjectStatePatch({
      projectConfigId: "project-1",
      projectConfig: nextProjectConfig,
      previousProjectStateRevision: 20,
      projectStateRevision: 21,
      completedOpIds: [],
      pendingOpIds: [],
    });

    expect(applied).toBe(true);
    expect(useProjectState.getState().projectConfig.isEditingViewMode).toBe(
      true,
    );
    expect(
      useProjectState.getState().projectConfig.viewModes[viewModeAId].name,
    ).toBe("Renamed View");
    expect(getProjectStateRevision("project-1")).toBe(21);
  });

  it("applies section-impl patches and updates revision tracking", () => {
    const sectionId = "section-1";
    const variantId = "variant-1";
    const implId = "chat-impl-1";
    const projectConfig = createProjectConfig({
      id: "project-1",
      sectionVariantMap: { [sectionId]: variantId },
      topLevelSections: {},
      activeIds: [],
    });
    useProjectState.setState({
      projectConfig,
      sections: {
        [sectionId]: createCore({ id: sectionId }),
      },
      sectionImpls: {
        [implId]: createChatSectionImpl({
          id: implId,
          type: SectionTypeEnum.Chat,
          inputText: "before",
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
      parentSectionMap: { [sectionId]: null },
      shownParamIds: {},
      previewSectionVariantMap: {},
      requiredDecodedImages: [],
    });
    usePendingOperations.setState({ pending: [] });

    const applied = applySectionImplProjectStatePatch({
      projectConfigId: "project-1",
      sectionId,
      sectionImpl: createChatSectionImpl({
        id: implId,
        type: SectionTypeEnum.Chat,
        inputText: "after",
      }),
      previousProjectStateRevision: 31,
      projectStateRevision: 32,
      completedOpIds: [],
      pendingOpIds: [],
    });

    expect(applied).toBe(true);
    expect(
      (useProjectState.getState().sectionImpls[implId] as { inputText: string })
        .inputText,
    ).toBe("after");
    expect(getProjectStateRevision("project-1")).toBe(32);
  });

  it("applies section-impls patches for multiple sections in one update", () => {
    const sectionOneId = "section-1";
    const sectionTwoId = "section-2";
    const variantOneId = "variant-1";
    const variantTwoId = "variant-2";
    const implOneId = "terminal-impl-1";
    const implTwoId = "terminal-impl-2";
    const projectConfig = createProjectConfig({
      id: "project-1",
      sectionVariantMap: {
        [sectionOneId]: variantOneId,
        [sectionTwoId]: variantTwoId,
      },
      topLevelSections: {},
      activeIds: [],
    });
    useProjectState.setState({
      projectConfig,
      sections: {
        [sectionOneId]: createCore({ id: sectionOneId }),
        [sectionTwoId]: createCore({ id: sectionTwoId }),
      },
      sectionImpls: {
        [implOneId]: createTerminalSectionImpl({
          id: implOneId,
          type: SectionTypeEnum.Terminal,
          isMinimized: false,
        }),
        [implTwoId]: createTerminalSectionImpl({
          id: implTwoId,
          type: SectionTypeEnum.Terminal,
          isMinimized: false,
        }),
      },
      sectionVariants: {
        [variantOneId]: createVariant({
          id: variantOneId,
          impl: implOneId,
          nonPresetImpls: [],
        }),
        [variantTwoId]: createVariant({
          id: variantTwoId,
          impl: implTwoId,
          nonPresetImpls: [],
        }),
      },
      codeObjs: {},
      codeObjImpls: {},
      codeObjVariants: {},
      artifactGroups: {},
      singletonSections: createSingletonSections(),
      parentSectionMap: {
        [sectionOneId]: null,
        [sectionTwoId]: null,
      },
      shownParamIds: {},
      previewSectionVariantMap: {},
      requiredDecodedImages: [],
    });
    usePendingOperations.setState({ pending: [] });

    const applied = applySectionImplsProjectStatePatch({
      projectConfigId: "project-1",
      sectionImpls: {
        [sectionOneId]: createTerminalSectionImpl({
          id: implOneId,
          type: SectionTypeEnum.Terminal,
          isMinimized: true,
        }),
        [sectionTwoId]: createTerminalSectionImpl({
          id: implTwoId,
          type: SectionTypeEnum.Terminal,
          isMinimized: true,
        }),
      },
      previousProjectStateRevision: 44,
      projectStateRevision: 45,
      completedOpIds: [],
      pendingOpIds: [],
    });

    expect(applied).toBe(true);
    const sectionOneImpl = getCurrEffectiveSectionImpl(
      useProjectState.getState(),
      sectionOneId,
    );
    const sectionTwoImpl = getCurrEffectiveSectionImpl(
      useProjectState.getState(),
      sectionTwoId,
    );
    expect(sectionOneImpl.type).toBe(SectionTypeEnum.Terminal);
    expect(sectionTwoImpl.type).toBe(SectionTypeEnum.Terminal);
    if (sectionOneImpl.type !== SectionTypeEnum.Terminal) {
      throw new Error("Expected first section impl to remain terminal.");
    }
    if (sectionTwoImpl.type !== SectionTypeEnum.Terminal) {
      throw new Error("Expected second section impl to remain terminal.");
    }
    expect(sectionOneImpl.isMinimized).toBe(true);
    expect(sectionTwoImpl.isMinimized).toBe(true);
    expect(getProjectStateRevision("project-1")).toBe(45);
  });

  it("applies code-obj patches and updates revision tracking", () => {
    const codeObjId = "param-1";
    const variantId = "variant-param-1";
    const implId = "impl-param-1";
    const projectConfig = createProjectConfig({
      id: "project-1",
      sectionVariantMap: {},
      topLevelSections: {},
      activeIds: [],
    });
    useProjectState.setState({
      projectConfig,
      sections: {},
      sectionImpls: {},
      sectionVariants: {},
      codeObjs: {
        [codeObjId]: createCore({
          id: codeObjId,
          name: "before-name",
        }),
      },
      codeObjImpls: {
        [implId]: createCodeParamCodeObjImpl(
          createUserDefaultCodeParamCodeObjImpl(),
          {
            id: implId,
            value: "before-value",
          },
        ),
      },
      codeObjVariants: {
        [variantId]: createVariant({
          id: variantId,
          impl: implId,
          nonPresetImpls: [],
        }),
      },
      artifactGroups: {},
      singletonSections: createSingletonSections(),
      parentSectionMap: {},
      shownParamIds: {},
      previewSectionVariantMap: {},
      requiredDecodedImages: [],
    });
    usePendingOperations.setState({ pending: [] });

    const applied = applyCodeObjsProjectStatePatch({
      projectConfigId: "project-1",
      codeObjs: {
        [codeObjId]: createCore({
          id: codeObjId,
          name: "after-name",
        }),
      },
      codeObjVariants: {
        [variantId]: createVariant({
          id: variantId,
          impl: implId,
          nonPresetImpls: [],
        }),
      },
      codeObjImpls: {
        [implId]: createCodeParamCodeObjImpl(
          createUserDefaultCodeParamCodeObjImpl(),
          {
            id: implId,
            value: "after-value",
          },
        ),
      },
      previousProjectStateRevision: 50,
      projectStateRevision: 51,
      completedOpIds: [],
      pendingOpIds: [],
    });

    expect(applied).toBe(true);
    expect(useProjectState.getState().codeObjs[codeObjId].name).toBe(
      "after-name",
    );
    const patchedImpl = useProjectState.getState().codeObjImpls[implId];
    expect(isBaseChildlessCodeObjImpl(patchedImpl)).toBe(true);
    if (!isBaseChildlessCodeObjImpl(patchedImpl)) {
      throw new Error("Expected childless code-obj impl.");
    }
    expect(patchedImpl.value).toBe("after-value");
    expect(getProjectStateRevision("project-1")).toBe(51);
  });

  it("applies structural patches and updates revision tracking", () => {
    const oldSectionId = "section-old";
    const oldVariantId = "variant-old";
    const oldImplId = "impl-old";
    const nextSectionId = "section-next";
    const nextVariantId = "variant-next";
    const nextImplId = "impl-next";
    const initialProjectConfig = createProjectConfig({
      id: "project-1",
      sectionVariantMap: { [oldSectionId]: oldVariantId },
      topLevelSections: {
        [oldSectionId]: { x: 0, y: 0, zIndex: 0, w: 200, h: 160 },
      },
      activeIds: [],
    });
    useProjectState.setState({
      projectConfig: initialProjectConfig,
      sections: {
        [oldSectionId]: createCore({ id: oldSectionId }),
      },
      sectionImpls: {
        [oldImplId]: createTerminalSectionImpl({
          id: oldImplId,
          type: SectionTypeEnum.Terminal,
        }),
      },
      sectionVariants: {
        [oldVariantId]: createVariant({
          id: oldVariantId,
          impl: oldImplId,
          nonPresetImpls: [],
        }),
      },
      codeObjs: {},
      codeObjImpls: {},
      codeObjVariants: {},
      artifactGroups: {},
      singletonSections: createSingletonSections(),
      parentSectionMap: { [oldSectionId]: null },
      shownParamIds: {},
      previewSectionVariantMap: { [oldSectionId]: oldVariantId },
      requiredDecodedImages: [],
    });
    usePendingOperations.setState({ pending: [] });
    useNodeInternals.setState({ x: new Map() });

    const nextProjectConfig = createProjectConfig({
      id: "project-1",
      sectionVariantMap: { [nextSectionId]: nextVariantId },
      topLevelSections: {
        [nextSectionId]: { x: 10, y: 15, zIndex: 0, w: 220, h: 180 },
      },
      activeIds: [],
    });
    const applied = applyStructuralProjectStatePatch({
      projectConfigId: "project-1",
      projectConfig: nextProjectConfig,
      sections: {
        [nextSectionId]: createCore({ id: nextSectionId }),
      },
      sectionVariants: {
        [nextVariantId]: createVariant({
          id: nextVariantId,
          impl: nextImplId,
          nonPresetImpls: [],
        }),
      },
      sectionImpls: {
        [nextImplId]: createTerminalSectionImpl({
          id: nextImplId,
          type: SectionTypeEnum.Terminal,
        }),
      },
      parentSectionMap: { [nextSectionId]: null },
      previousProjectStateRevision: 60,
      projectStateRevision: 61,
      completedOpIds: [],
      pendingOpIds: [],
    });

    expect(applied).toBe(true);
    expect(useProjectState.getState().sections[oldSectionId]).toBeUndefined();
    expect(useProjectState.getState().sections[nextSectionId]).toBeDefined();
    expect(
      useProjectState.getState().projectConfig.sectionVariantMap[nextSectionId],
    ).toBe(nextVariantId);
    expect(
      useProjectState.getState().parentSectionMap[nextSectionId],
    ).toBeNull();
    expect(useProjectState.getState().previewSectionVariantMap).toEqual({});
    expect(useNodeInternals.getState().x.has(nextSectionId)).toBe(true);
    expect(getProjectStateRevision("project-1")).toBe(61);
  });

  it("applies structural delta patches with removals and updates revision tracking", () => {
    const keepSectionId = "section-keep";
    const removedSectionId = "section-removed";
    const addedSectionId = "section-added";
    const keepVariantId = "variant-keep";
    const removedVariantId = "variant-removed";
    const addedVariantId = "variant-added";
    const keepImplId = "impl-keep";
    const removedImplId = "impl-removed";
    const addedImplId = "impl-added";
    const initialProjectConfig = createProjectConfig({
      id: "project-1",
      sectionVariantMap: {
        [keepSectionId]: keepVariantId,
        [removedSectionId]: removedVariantId,
      },
      topLevelSections: {
        [keepSectionId]: { x: 0, y: 0, zIndex: 0, w: 200, h: 160 },
        [removedSectionId]: { x: 20, y: 10, zIndex: 0, w: 200, h: 160 },
      },
      activeIds: [],
    });
    useProjectState.setState({
      projectConfig: initialProjectConfig,
      sections: {
        [keepSectionId]: createCore({ id: keepSectionId, name: "keep-before" }),
        [removedSectionId]: createCore({ id: removedSectionId }),
      },
      sectionImpls: {
        [keepImplId]: createTerminalSectionImpl({
          id: keepImplId,
          type: SectionTypeEnum.Terminal,
        }),
        [removedImplId]: createTerminalSectionImpl({
          id: removedImplId,
          type: SectionTypeEnum.Terminal,
        }),
      },
      sectionVariants: {
        [keepVariantId]: createVariant({
          id: keepVariantId,
          impl: keepImplId,
          nonPresetImpls: [],
        }),
        [removedVariantId]: createVariant({
          id: removedVariantId,
          impl: removedImplId,
          nonPresetImpls: [],
        }),
      },
      codeObjs: {},
      codeObjImpls: {},
      codeObjVariants: {},
      artifactGroups: {},
      singletonSections: createSingletonSections(),
      parentSectionMap: {
        [keepSectionId]: null,
        [removedSectionId]: null,
      },
      shownParamIds: {},
      previewSectionVariantMap: {
        [keepSectionId]: keepVariantId,
        [removedSectionId]: removedVariantId,
      },
      requiredDecodedImages: [],
    });
    usePendingOperations.setState({ pending: [] });
    useNodeInternals.setState({ x: new Map() });

    const nextProjectConfig = createProjectConfig({
      id: "project-1",
      sectionVariantMap: {
        [keepSectionId]: keepVariantId,
        [addedSectionId]: addedVariantId,
      },
      topLevelSections: {
        [keepSectionId]: { x: 0, y: 0, zIndex: 0, w: 200, h: 160 },
        [addedSectionId]: { x: 60, y: 30, zIndex: 0, w: 220, h: 180 },
      },
      activeIds: [],
    });
    const applied = applyStructuralProjectStatePatch({
      projectConfigId: "project-1",
      projectConfig: nextProjectConfig,
      sections: {
        [keepSectionId]: createCore({ id: keepSectionId, name: "keep-after" }),
        [addedSectionId]: createCore({ id: addedSectionId }),
      },
      sectionVariants: {
        [addedVariantId]: createVariant({
          id: addedVariantId,
          impl: addedImplId,
          nonPresetImpls: [],
        }),
      },
      sectionImpls: {
        [addedImplId]: createTerminalSectionImpl({
          id: addedImplId,
          type: SectionTypeEnum.Terminal,
        }),
      },
      parentSectionMap: {
        [keepSectionId]: null,
        [addedSectionId]: null,
      },
      previousProjectStateRevision: 70,
      projectStateRevision: 71,
      completedOpIds: [],
      pendingOpIds: [],
      isFullSnapshot: false,
      removedSectionIds: [removedSectionId],
      removedSectionVariantIds: [removedVariantId],
      removedSectionImplIds: [removedImplId],
      removedParentSectionIds: [removedSectionId],
    });

    expect(applied).toBe(true);
    expect(useProjectState.getState().sections[keepSectionId].name).toBe(
      "keep-after",
    );
    expect(
      useProjectState.getState().sections[removedSectionId],
    ).toBeUndefined();
    expect(useProjectState.getState().sections[addedSectionId]).toBeDefined();
    expect(
      useProjectState.getState().sectionVariants[removedVariantId],
    ).toBeUndefined();
    expect(
      useProjectState.getState().sectionVariants[addedVariantId],
    ).toBeDefined();
    expect(
      useProjectState.getState().sectionImpls[removedImplId],
    ).toBeUndefined();
    expect(useProjectState.getState().sectionImpls[addedImplId]).toBeDefined();
    expect(
      useProjectState.getState().parentSectionMap[removedSectionId],
    ).toBeUndefined();
    expect(
      useProjectState.getState().previewSectionVariantMap[removedSectionId],
    ).toBeUndefined();
    expect(getProjectStateRevision("project-1")).toBe(71);
  });

  it("keeps callable + param semantic data when structural delta only updates sections", () => {
    const sectionId = "section-callable";
    const variantId = "variant-callable";
    const implId = "impl-callable";
    const callableCodeObjId = "code-obj-callable";
    const paramCodeObjId = "code-obj-param";
    const paramVariantId = "variant-param";
    const paramImplId = "impl-param";
    const initialProjectConfig = createProjectConfig({
      id: "project-1",
      sectionVariantMap: { [sectionId]: variantId },
      topLevelSections: {
        [sectionId]: { x: 12, y: 20, zIndex: 0, w: 260, h: 180 },
      },
      activeIds: [sectionId],
    });
    const shownParams: ShownParamIds = {
      pinned: {
        requiredParamIdsToPaths: {},
        topLevelParamIds: [paramCodeObjId],
      },
      unpinned: {
        requiredParamIdsToPaths: { [paramCodeObjId]: [paramCodeObjId] },
        topLevelParamIds: [paramCodeObjId],
      },
    };
    useProjectState.setState({
      projectConfig: initialProjectConfig,
      sections: {
        [sectionId]: createCore({ id: sectionId, name: "callable-before" }),
      },
      sectionImpls: {
        [implId]: createCallableSectionImpl(
          createUserDefaultCallableSectionImpl(),
          {
            id: implId,
            callable: callableCodeObjId,
            codeObjVariantMap: { [paramCodeObjId]: paramVariantId },
            topLevelParamId: paramCodeObjId,
          },
        ),
      },
      sectionVariants: {
        [variantId]: createVariant({
          id: variantId,
          impl: implId,
          nonPresetImpls: [],
        }),
      },
      codeObjs: {
        [callableCodeObjId]: createCore({
          id: callableCodeObjId,
          name: "math.sqrt",
        }),
        [paramCodeObjId]: createCore({
          id: paramCodeObjId,
          name: "x",
        }),
      },
      codeObjVariants: {
        [paramVariantId]: createVariant({
          id: paramVariantId,
          impl: paramImplId,
          nonPresetImpls: [],
        }),
      },
      codeObjImpls: {
        [paramImplId]: createCodeParamCodeObjImpl(
          createUserDefaultCodeParamCodeObjImpl(),
          {
            id: paramImplId,
            value: "123",
          },
        ),
      },
      artifactGroups: {},
      singletonSections: createSingletonSections(),
      parentSectionMap: { [sectionId]: null },
      shownParamIds: { [variantId]: shownParams },
      previewSectionVariantMap: {},
      requiredDecodedImages: [],
    });
    usePendingOperations.setState({ pending: [] });
    useNodeInternals.setState({ x: new Map() });

    const nextProjectConfig = createProjectConfig({
      id: "project-1",
      sectionVariantMap: { [sectionId]: variantId },
      topLevelSections: {
        [sectionId]: { x: 40, y: 65, zIndex: 0, w: 260, h: 180 },
      },
      activeIds: [sectionId],
    });
    const applied = applyStructuralProjectStatePatch({
      projectConfigId: "project-1",
      projectConfig: nextProjectConfig,
      sections: {
        [sectionId]: createCore({ id: sectionId, name: "callable-after" }),
      },
      sectionVariants: {},
      sectionImpls: {},
      parentSectionMap: {},
      previousProjectStateRevision: 71,
      projectStateRevision: 72,
      completedOpIds: [],
      pendingOpIds: [],
      isFullSnapshot: false,
    });

    expect(applied).toBe(true);
    const nextState = useProjectState.getState();
    const nextSectionImpl = nextState.sectionImpls[implId];
    expect(nextState.sections[sectionId].name).toBe("callable-after");
    expect(nextSectionImpl.type).toBe(SectionTypeEnum.Callable);
    if (nextSectionImpl.type !== SectionTypeEnum.Callable) {
      throw new Error("Expected callable section impl.");
    }
    expect(nextSectionImpl.callable).toBe(callableCodeObjId);
    expect(nextState.codeObjs[callableCodeObjId].name).toBe("math.sqrt");
    const nextParamImpl = nextState.codeObjImpls[paramImplId];
    if (!isBaseChildlessCodeObjImpl(nextParamImpl)) {
      throw new Error("Expected childless param impl.");
    }
    expect(nextParamImpl.value).toBe("123");
    expect(getProjectStateRevision("project-1")).toBe(72);
  });

  it("rejects structural delta patches when required variants are missing", () => {
    const sectionId = "section-1";
    const variantId = "variant-1";
    const implId = "impl-1";
    const invalidVariantId = "variant-invalid";
    const initialProjectConfig = createProjectConfig({
      id: "project-1",
      sectionVariantMap: { [sectionId]: variantId },
      topLevelSections: {
        [sectionId]: { x: 0, y: 0, zIndex: 0, w: 200, h: 160 },
      },
      activeIds: [],
    });
    useProjectState.setState({
      projectConfig: initialProjectConfig,
      sections: {
        [sectionId]: createCore({ id: sectionId, name: "before" }),
      },
      sectionImpls: {
        [implId]: createTerminalSectionImpl({
          id: implId,
          type: SectionTypeEnum.Terminal,
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
      parentSectionMap: { [sectionId]: null },
      shownParamIds: {},
      previewSectionVariantMap: {},
      requiredDecodedImages: [],
    });
    usePendingOperations.setState({ pending: [] });
    useNodeInternals.setState({ x: new Map() });
    const revisionBefore = getProjectStateRevision("project-1");

    const nextProjectConfig = createProjectConfig({
      id: "project-1",
      sectionVariantMap: { [sectionId]: invalidVariantId },
      topLevelSections: {
        [sectionId]: { x: 0, y: 0, zIndex: 0, w: 200, h: 160 },
      },
      activeIds: [],
    });
    const applied = applyStructuralProjectStatePatch({
      projectConfigId: "project-1",
      projectConfig: nextProjectConfig,
      sections: {},
      sectionVariants: {},
      sectionImpls: {},
      parentSectionMap: {},
      previousProjectStateRevision: 72,
      projectStateRevision: 73,
      completedOpIds: [],
      pendingOpIds: [],
      isFullSnapshot: false,
    });

    expect(applied).toBe(false);
    expect(useProjectState.getState().sections[sectionId].name).toBe("before");
    expect(
      useProjectState.getState().projectConfig.sectionVariantMap[sectionId],
    ).toBe(variantId);
    expect(getProjectStateRevision("project-1")).toBe(revisionBefore);
  });

  it("rejects structural patches when shown-param ids for param sections are missing", () => {
    const oldSectionId = "section-old";
    const oldVariantId = "variant-old";
    const oldImplId = "impl-old";
    const nextSectionId = "section-next";
    const nextVariantId = "variant-next";
    const nextImplId = "impl-next";
    const initialProjectConfig = createProjectConfig({
      id: "project-1",
      sectionVariantMap: { [oldSectionId]: oldVariantId },
      topLevelSections: {
        [oldSectionId]: { x: 0, y: 0, zIndex: 0, w: 200, h: 160 },
      },
      activeIds: [],
    });
    useProjectState.setState({
      projectConfig: initialProjectConfig,
      sections: {
        [oldSectionId]: createCore({ id: oldSectionId }),
      },
      sectionImpls: {
        [oldImplId]: createTerminalSectionImpl({
          id: oldImplId,
          type: SectionTypeEnum.Terminal,
        }),
      },
      sectionVariants: {
        [oldVariantId]: createVariant({
          id: oldVariantId,
          impl: oldImplId,
          nonPresetImpls: [],
        }),
      },
      codeObjs: {},
      codeObjImpls: {},
      codeObjVariants: {},
      artifactGroups: {},
      singletonSections: createSingletonSections(),
      parentSectionMap: { [oldSectionId]: null },
      shownParamIds: {},
      previewSectionVariantMap: {},
      requiredDecodedImages: [],
    });
    usePendingOperations.setState({ pending: [] });
    useNodeInternals.setState({ x: new Map() });

    const nextProjectConfig = createProjectConfig({
      id: "project-1",
      sectionVariantMap: { [nextSectionId]: nextVariantId },
      topLevelSections: {
        [nextSectionId]: { x: 10, y: 15, zIndex: 0, w: 220, h: 180 },
      },
      activeIds: [],
    });
    const applied = applyStructuralProjectStatePatch({
      projectConfigId: "project-1",
      projectConfig: nextProjectConfig,
      sections: {
        [nextSectionId]: createCore({ id: nextSectionId }),
      },
      sectionVariants: {
        [nextVariantId]: createVariant({
          id: nextVariantId,
          impl: nextImplId,
          nonPresetImpls: [],
        }),
      },
      sectionImpls: {
        [nextImplId]: createCallableSectionImpl(
          createUserDefaultCallableSectionImpl(),
          {
            id: nextImplId,
          },
        ),
      },
      parentSectionMap: { [nextSectionId]: null },
      previousProjectStateRevision: 80,
      projectStateRevision: 81,
      completedOpIds: [],
      pendingOpIds: [],
    });

    expect(applied).toBe(false);
    expect(useProjectState.getState().sections[oldSectionId]).toBeDefined();
    expect(useProjectState.getState().sections[nextSectionId]).toBeUndefined();
  });

  it("applies app-definition patches and updates revision tracking", () => {
    useAppDefinition.setState({
      appDefinition: null,
      appSpec: null,
    });
    usePendingOperations.setState({ pending: [] });

    const applied = applyAppDefinitionProjectStatePatch({
      projectConfigId: "project-1",
      appDefinition: {
        appSpecPath: "app_specs/custom.json",
        appSpecVersion: "v2",
        catalogId: "setta.app.custom",
        routes: [],
        dataBindings: {},
        actions: {},
        theme: {},
        assets: [],
      },
      appSpec: {
        root: { key: "root", type: "Stack" },
        elements: {},
      },
      previousProjectStateRevision: 70,
      projectStateRevision: 71,
      completedOpIds: [],
      pendingOpIds: [],
    });

    expect(applied).toBe(true);
    expect(useAppDefinition.getState().appDefinition?.catalogId).toBe(
      "setta.app.custom",
    );
    expect(useAppDefinition.getState().appSpec).toEqual({
      root: { key: "root", type: "Stack" },
      elements: {},
    });
    expect(getProjectStateRevision("project-1")).toBe(71);
  });

  it("recomputes shown param ids when pinned params change in a section-impl patch", () => {
    const sectionId = "section-1";
    const variantId = "variant-1";
    const implId = "callable-impl-1";
    const initialShown: ShownParamIds = {
      pinned: {
        requiredParamIdsToPaths: {},
        topLevelParamIds: [],
      },
      unpinned: {
        requiredParamIdsToPaths: { "param-a": ["param-a"] },
        topLevelParamIds: ["param-a"],
      },
    };
    const nextShown: ShownParamIds = {
      pinned: {
        requiredParamIdsToPaths: { "param-a": ["param-a"] },
        topLevelParamIds: ["param-a"],
      },
      unpinned: {
        requiredParamIdsToPaths: {},
        topLevelParamIds: [],
      },
    };
    const projectConfig = createProjectConfig({
      id: "project-1",
      sectionVariantMap: { [sectionId]: variantId },
      topLevelSections: {},
      activeIds: [],
    });
    useProjectState.setState({
      projectConfig,
      sections: {
        [sectionId]: createCore({ id: sectionId }),
      },
      sectionImpls: {
        [implId]: createCallableSectionImpl(
          createUserDefaultCallableSectionImpl(),
          {
            id: implId,
            pinnedParams: [],
          },
        ),
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
      parentSectionMap: { [sectionId]: null },
      shownParamIds: { [variantId]: initialShown },
      previewSectionVariantMap: {},
      requiredDecodedImages: [],
    });
    usePendingOperations.setState({ pending: [] });

    const applied = applySectionImplProjectStatePatch({
      projectConfigId: "project-1",
      sectionId,
      sectionImpl: createCallableSectionImpl(
        createUserDefaultCallableSectionImpl(),
        {
          id: implId,
          pinnedParams: ["param-a"],
        },
      ),
      previousProjectStateRevision: 40,
      projectStateRevision: 41,
      completedOpIds: [],
      pendingOpIds: [],
    });

    expect(applied).toBe(true);
    expect(useProjectState.getState().shownParamIds[variantId]).toEqual(
      nextShown,
    );
    expect(getProjectStateRevision("project-1")).toBe(41);
  });
});
