import { useReactFlow } from "forks/xyflow/core/store";
import * as endpoints from "openapi/http";
import {
  createNodesMapFromProjectConfigChildren,
  createTopLevelSectionLayoutDict,
  dispatchOptimisticProjectStateUpdate,
  getAttachedTerminalParentIdForTerminalSection,
  getCurrCodeObjVariantIfPresent,
  getCurrEffectiveCodeObjImplIfPresent,
  getCurrEffectiveCodeObjImplWithTypeGuardIfPresent,
  getCurrEffectiveSectionImpl,
  getCurrShownParamIds,
  getDisplayedSectionIdToChildren,
  getEmbeddedAttachedTerminalForCodeSection,
  getEmbeddedAttachedTerminalParentIdForTerminalSection,
  getParamDisplayNameIfPresent,
  getSectionDescendants,
  getSectionIsHorizontalOrientation,
  getTopLevelSectionIdsForDisplay,
  processProjectStateUpdateFromBackend,
  setCodeObjVariantImplValue,
  setCurrEffectiveSectionImplValue,
  unselectAllParams,
  updateAllProjectMetadata,
} from "state/actions/sectionInfos";
import {
  useAllProjectMetadata,
  useLocalStorage,
  useMisc,
  useNodeInternals,
  usePendingOperations,
  useProjectState,
  type ZustandProjectState,
} from "state/definitions";
import type { ProjectStateBackendUpdate } from "testUtils/projectStateBackendUpdate";
import {
  CodeObjTypeEnum,
  ConfigLanguageEnum,
  createCallableSectionImpl,
  createChatSectionImpl,
  createCodeParamCodeObjImpl,
  createCodeSectionImpl,
  createCore,
  createDictSectionImpl,
  createListRootSectionImpl,
  createProjectConfig,
  createSingleConfig,
  createSingletonSections,
  createTerminalSectionImpl,
  createVariant,
  ListRootViewModeEnum,
  SectionTypeEnum,
  type BaseChildlessCodeObjImplUnion,
  type ShownParamIDs,
  type SingleConfig,
  type ViewMode,
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
        [implId]: createListRootSectionImpl({
          id: implId,
          viewMode: ListRootViewModeEnum.kanban,
        }),
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

describe("updateAllProjectMetadata", () => {
  it("normalizes null project metadata to an empty array", () => {
    updateAllProjectMetadata({
      defaultProjectConfigId: null,
      projectMetadata: null,
    });

    const { defaultProjectConfigId, projectMetadata } =
      useAllProjectMetadata.getState();

    expect({ defaultProjectConfigId, projectMetadata }).toEqual({
      defaultProjectConfigId: null,
      projectMetadata: [],
    });
  });
});

describe("getCurrShownParamIds", () => {
  it("returns pinned and unpinned entries for the active variant", () => {
    const sectionId = "section-1";
    const variantId = "variant-1";
    const shown: ShownParamIDs = {
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
});

describe("unselectAllParams", () => {
  it("clears selected params for MetaControl sections", () => {
    const projectId = "project-1";
    const sectionId = "meta-section";
    const sectionVariantId = "meta-variant";
    const sectionImplId = "meta-impl";
    const paramId = "meta-param";

    const routeMock = vi
      .spyOn(endpoints, "unselectAllParams")
      .mockResolvedValue({
        data: null,
        request: new Request("http://localhost/unselectAllParams"),
        response: new Response(null, { status: 200 }),
      } as Awaited<ReturnType<typeof endpoints.unselectAllParams>>);

    useProjectState.setState({
      projectConfig: createProjectConfig({
        id: projectId,
        sectionVariantMap: { [sectionId]: sectionVariantId },
      }),
      sections: {
        [sectionId]: createCore({ id: sectionId }),
      },
      sectionImpls: {
        [sectionImplId]: {
          aspectRatioExtraHeight: 0,
          aspectRatioExtraWidth: 0,
          codeObjVariantMap: { [paramId]: "meta-param-variant" },
          columnWidth: null,
          edgeInputParams: [],
          edgeOutputPorts: [],
          hideUnpinnedParams: false,
          id: sectionImplId,
          ignoreTypeErrors: { callable: false, params: {} },
          isFrozen: false,
          isInOtherProjectConfigs: false,
          isMinimized: false,
          isPreset: false,
          metaControlParamId: paramId,
          name: "Meta control",
          paramFilter: "",
          pinnedParams: [],
          positionAndSizeLocked: false,
          selectedParams: [paramId],
          showSectionTitle: false,
          size: { width: 250, height: 150 },
          styleColor: null,
          tagColor: null,
          type: SectionTypeEnum.MetaControl,
        },
      },
      sectionVariants: {
        [sectionVariantId]: createVariant({
          id: sectionVariantId,
          name: "Variant",
          impl: sectionImplId,
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
    } as unknown as ZustandProjectState);
    usePendingOperations.setState({ pending: [] });

    expect(unselectAllParams()).toBe(true);
    expect(routeMock).toHaveBeenCalledOnce();
    expect(
      getCurrEffectiveSectionImpl(useProjectState.getState(), sectionId),
    ).toMatchObject({
      type: SectionTypeEnum.MetaControl,
      selectedParams: [],
    });
  });
});

describe("current code object helpers", () => {
  it("returns null when a stale code object id is missing from the active section variant", () => {
    const sectionId = "section-1";
    const sectionVariantId = "section-variant-1";
    const sectionImplId = "section-impl-1";
    const currentParamId = "param-current";
    const currentParamVariantId = "param-current-variant";
    const currentParamImplId = "param-current-impl";
    const staleParamId = "param-stale";
    const staleParamVariantId = "param-stale-variant";
    const staleParamImplId = "param-stale-impl";
    const state = {
      projectConfig: createProjectConfig({
        id: "project-1",
        sectionVariantMap: { [sectionId]: sectionVariantId },
      }),
      sections: {
        [sectionId]: createCore({
          id: sectionId,
          name: "Callable",
          variants: [sectionVariantId],
          defaultVariant: sectionVariantId,
        }),
      },
      sectionImpls: {
        [sectionImplId]: createCallableSectionImpl({
          id: sectionImplId,
          codeObjVariantMap: {
            [currentParamId]: currentParamVariantId,
          },
        }),
      },
      sectionVariants: {
        [sectionVariantId]: createVariant({
          id: sectionVariantId,
          impl: sectionImplId,
          nonPresetImpls: [sectionImplId],
        }),
      },
      codeObjs: {
        [currentParamId]: createCore({
          id: currentParamId,
          name: "x",
          variants: [currentParamVariantId],
          defaultVariant: currentParamVariantId,
        }),
        [staleParamId]: createCore({
          id: staleParamId,
          name: "stale",
          variants: [staleParamVariantId],
          defaultVariant: staleParamVariantId,
        }),
      },
      codeObjImpls: {
        [currentParamImplId]: createCodeParamCodeObjImpl({
          id: currentParamImplId,
          value: "1",
        }),
        [staleParamImplId]: createCodeParamCodeObjImpl({
          id: staleParamImplId,
          value: "2",
        }),
      },
      codeObjVariants: {
        [currentParamVariantId]: createVariant({
          id: currentParamVariantId,
          impl: currentParamImplId,
          nonPresetImpls: [currentParamImplId],
        }),
        [staleParamVariantId]: createVariant({
          id: staleParamVariantId,
          impl: staleParamImplId,
          nonPresetImpls: [staleParamImplId],
        }),
      },
      artifactGroups: {},
      singletonSections: createSingletonSections(),
      parentSectionMap: { [sectionId]: null },
      shownParamIds: {},
      previewSectionVariantMap: {},
      requiredDecodedImages: [],
    } as ZustandProjectState;

    expect(
      getCurrCodeObjVariantIfPresent(state, sectionId, staleParamId),
    ).toBeNull();
    expect(
      getCurrEffectiveCodeObjImplIfPresent(state, sectionId, staleParamId),
    ).toBeNull();
    expect(
      getCurrEffectiveCodeObjImplWithTypeGuardIfPresent(
        state,
        sectionId,
        staleParamId,
        (impl): impl is ReturnType<typeof createCodeParamCodeObjImpl> =>
          impl.type === CodeObjTypeEnum.CodeParam,
      ),
    ).toBeNull();
    expect(getParamDisplayNameIfPresent(state, sectionId, staleParamId)).toBe(
      "stale",
    );
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

  it("returns backend-provided callable defaults for parameterized section impls", () => {
    const sectionId = "section-sparse-params";
    const variantId = "variant-sparse-params";
    const implId = "callable-impl-sparse-params";
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
        [implId]: createCallableSectionImpl({
          id: implId,
          type: SectionTypeEnum.Callable,
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

    const effective = getCurrEffectiveSectionImpl(state, sectionId);
    expect(effective.type).toBe(SectionTypeEnum.Callable);
    if (effective.type !== SectionTypeEnum.Callable) {
      throw new Error("Expected callable impl.");
    }
    expect(effective.codeObjVariantMap).toEqual({});
    expect(effective.hideUnpinnedParams).toBe(false);
    expect(effective.paramFilter).toBe("");
    expect(effective.columnWidth).toBeNull();
    expect(effective.configLanguage).toBe(ConfigLanguageEnum.python);
    expect(effective.pinnedParams).toEqual([]);
    expect(effective.selectedParams).toEqual([]);
    expect(effective.ignoreTypeErrors).toEqual({
      callable: false,
      params: {},
    });
    expect(effective.edgeInputParams).toEqual([]);
    expect(effective.edgeOutputPorts).toEqual([]);
    expect(effective.callable).toBeNull();
    expect(effective.hideParams).toBe(false);
  });

  it("returns backend-provided dict defaults for parameterized section impls", () => {
    const sectionId = "section-sparse-dict";
    const variantId = "variant-sparse-dict";
    const implId = "dict-impl-sparse";
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
        [implId]: createDictSectionImpl({
          id: implId,
          type: SectionTypeEnum.Dict,
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

    const effective = getCurrEffectiveSectionImpl(state, sectionId);
    expect(effective.type).toBe(SectionTypeEnum.Dict);
    if (effective.type !== SectionTypeEnum.Dict) {
      throw new Error("Expected dict impl.");
    }
    expect(effective.topLevelParamId).toBeNull();
    expect(effective.isJsonSource).toBe(false);
    expect(effective.jsonSourceKeys).toEqual([]);
    expect(effective.jsonSourceMissing).toBe(false);
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

  it("preserves base layout fields when the active view mode overrides only part of a section layout", () => {
    const sectionId = "section-visible";
    const variantId = "variant-visible";
    const implId = "impl-visible";
    const viewModeId = "view-1";
    const projectConfig = createProjectConfig({
      id: "project-1",
      sectionVariantMap: {
        [sectionId]: variantId,
      },
      topLevelSections: {
        [sectionId]: { x: 0, y: 0, zIndex: 7, w: 200, h: 160 },
      },
      viewModes: {
        [viewModeId]: {
          id: viewModeId,
          name: "Visible Only",
          sortIndex: 0,
          isUserFacing: false,
          isTab: true,
          visibilityBySectionId: {
            [sectionId]: true,
          },
          viewport: { x: 0, y: 0, zoom: 1 },
          viewportInitialized: false,
          topLevelSections: {
            [sectionId]: { x: 120, y: 240, w: 260, h: 180 },
          },
        },
      },
      activeViewModeId: viewModeId,
      isEditingViewMode: false,
    });
    const projectState = {
      projectConfig,
      sections: {
        [sectionId]: createCore({ id: sectionId }),
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
      height: 180,
      position: { x: 120, y: 240 },
      tempZIndex: 7,
      width: 260,
      zIndex: 7,
    });
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

describe("processProjectStateUpdateFromBackend", () => {
  it("applies viewport updates to the react flow store", () => {
    const sectionId = "section-1";
    const viewModeId = "view-1";
    const layout = { x: 0, y: 0, zIndex: 0, w: 200, h: 160 };
    const viewMode: ViewMode = {
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

    const update: ProjectStateBackendUpdate = {
      projectState: createSingleConfig({
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
      }),
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
    const viewMode: ViewMode = {
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

    const update: ProjectStateBackendUpdate = {
      projectState: createSingleConfig({
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
      }),
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
    const viewModeA: ViewMode = {
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
    const viewModeB: ViewMode = {
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

    const update: ProjectStateBackendUpdate = {
      projectState: createSingleConfig({
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
      }),
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

  it("fits view when visible top-level sections change while no viewport is stored", () => {
    const sectionVisibleA = "section-visible-a";
    const sectionVisibleB = "section-visible-b";
    const viewModeId = "view-1";
    const layout = { x: 0, y: 0, zIndex: 0, w: 200, h: 160 };
    const currentViewMode: ViewMode = {
      id: viewModeId,
      name: "Visible View",
      sortIndex: 0,
      isUserFacing: false,
      isTab: true,
      visibilityBySectionId: {
        [sectionVisibleA]: true,
      },
      viewport: null,
      viewportInitialized: false,
      topLevelSections: {
        [sectionVisibleA]: { ...layout },
      },
    };

    const currentProjectConfig = createProjectConfig({
      id: "project-1",
      topLevelSections: {
        [sectionVisibleA]: { ...layout },
      },
      viewModes: { [viewModeId]: currentViewMode },
      activeViewModeId: viewModeId,
      viewport: null,
      viewportInitialized: false,
    });

    useProjectState.setState({
      projectConfig: currentProjectConfig,
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

    const nextViewMode: ViewMode = {
      ...currentViewMode,
      visibilityBySectionId: {
        [sectionVisibleA]: true,
        [sectionVisibleB]: true,
      },
      topLevelSections: {
        [sectionVisibleA]: { ...layout },
        [sectionVisibleB]: { ...layout, x: 280 },
      },
    };

    processProjectStateUpdateFromBackend({
      projectState: createSingleConfig({
        projectConfig: {
          ...currentProjectConfig,
          topLevelSections: nextViewMode.topLevelSections,
          viewModes: { [viewModeId]: nextViewMode },
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
      }),
      completedOpIds: [],
      pendingOpIds: [],
    });

    const reactFlowState = useReactFlow.getState();
    expect(reactFlowState.fitViewOnInit).toBe(true);
    expect(reactFlowState.fitViewOnInitDone).toBe(false);
    expect(reactFlowState.fitViewOnInitOptions?.nodes).toEqual([
      { id: sectionVisibleA },
      { id: sectionVisibleB },
    ]);
  });

  it("requests node dimension updates when switching view modes without a viewport", () => {
    const sectionVisible = "section-visible";
    const sectionHidden = "section-hidden";
    const viewModeAId = "view-a";
    const viewModeBId = "view-b";
    const layout = { x: 0, y: 0, zIndex: 0, w: 200, h: 160 };
    const viewModeA: ViewMode = {
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
    const viewModeB: ViewMode = {
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

    const update: ProjectStateBackendUpdate = {
      projectState: createSingleConfig({
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
      }),
      completedOpIds: [],
      pendingOpIds: [],
    };

    processProjectStateUpdateFromBackend(update);

    expect(useMisc.getState().requestUpdateNodeDimensions).toBe(true);
  });

  it("publishes artifact-group changes even when every other backend-owned field is unchanged", () => {
    const projectConfig = createProjectConfig({
      id: "project-1",
    });
    const previewSectionVariantMap = {
      "previewed-section": "variant-preview",
    };
    const nextArtifactGroups = {
      "layer-1": {
        id: "layer-1",
        name: "Layer 1",
        artifactTransforms: [],
      },
    };

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
      previewSectionVariantMap,
      requiredDecodedImages: [],
    });
    usePendingOperations.setState({ pending: [] });
    useNodeInternals.setState({ x: new Map() });
    useReactFlow.setState({
      transform: [0, 0, 1],
      fitViewOnInit: false,
      fitViewOnInitDone: true,
    });

    // Only artifactGroups changes here; the backend update must still publish.
    processProjectStateUpdateFromBackend({
      projectState: createSingleConfig({
        projectConfig,
        sections: {},
        sectionImpls: {},
        sectionVariants: {},
        codeObjs: {},
        codeObjImpls: {},
        codeObjVariants: {},
        artifactGroups: nextArtifactGroups,
        singletonSections: createSingletonSections(),
        parentSectionMap: {},
        shownParamIds: {},
        requiredDecodedImages: [],
        genCodeBinding: null,
      }),
      completedOpIds: [],
      pendingOpIds: [],
    });

    expect(useProjectState.getState().artifactGroups).toEqual(
      nextArtifactGroups,
    );
    expect(useProjectState.getState().previewSectionVariantMap).toEqual(
      previewSectionVariantMap,
    );
  });

  it("keeps the no-op backend short-circuit for truly identical normalized project state", () => {
    const projectConfig = createProjectConfig({
      id: "project-1",
    });
    const nodeInternals = new Map([
      [
        "section-1",
        {
          id: "section-1",
          position: { x: 30, y: 40 },
          width: 120,
          height: 90,
          zIndex: 0,
          tempZIndex: 0,
        },
      ],
    ]);

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
      previewSectionVariantMap: {
        "previewed-section": "variant-preview",
      },
      requiredDecodedImages: [],
    });
    usePendingOperations.setState({ pending: [] });
    useNodeInternals.setState({ x: nodeInternals });
    useReactFlow.setState({
      transform: [0, 0, 1],
      fitViewOnInit: false,
      fitViewOnInitDone: true,
    });

    const projectStateSetSpy = vi.spyOn(useProjectState, "setState");
    const nodeInternalsSetSpy = vi.spyOn(useNodeInternals, "setState");

    try {
      // This guards the optimized branch after widening the comparator to the
      // full backend-owned project-state shape.
      processProjectStateUpdateFromBackend({
        projectState: createSingleConfig({
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
        }),
        completedOpIds: [],
        pendingOpIds: [],
      });

      expect(projectStateSetSpy).not.toHaveBeenCalled();
      expect(nodeInternalsSetSpy).not.toHaveBeenCalled();
    } finally {
      projectStateSetSpy.mockRestore();
      nodeInternalsSetSpy.mockRestore();
    }
  });

  it("reapplies pending param value edits to the captured variant instead of the newly active variant", () => {
    const projectId = "project-1";
    const sectionId = "callable-section";
    const sectionVariantAId = "section-variant-a";
    const sectionVariantBId = "section-variant-b";
    const sectionImplAId = "section-impl-a";
    const sectionImplBId = "section-impl-b";
    const paramId = "param-x";
    const paramVariantAId = "param-variant-a";
    const paramVariantBId = "param-variant-b";
    const paramImplAId = "param-impl-a";
    const paramImplBId = "param-impl-b";

    const sectionCore = createCore({
      id: sectionId,
      name: "Callable",
      variants: [sectionVariantAId, sectionVariantBId],
      defaultVariant: sectionVariantAId,
    });
    const sectionVariantA = createVariant({
      id: sectionVariantAId,
      impl: sectionImplAId,
      nonPresetImpls: [sectionImplAId],
    });
    const sectionVariantB = createVariant({
      id: sectionVariantBId,
      impl: sectionImplBId,
      nonPresetImpls: [sectionImplBId],
    });
    const paramCore = createCore({
      id: paramId,
      name: "x",
      variants: [paramVariantAId, paramVariantBId],
      defaultVariant: paramVariantAId,
      unsharedKeys: ["value"],
    });
    const paramVariantA = createVariant({
      id: paramVariantAId,
      impl: paramImplAId,
      nonPresetImpls: [paramImplAId],
    });
    const paramVariantB = createVariant({
      id: paramVariantBId,
      impl: paramImplBId,
      nonPresetImpls: [paramImplBId],
    });

    useProjectState.setState({
      projectConfig: createProjectConfig({
        id: projectId,
        sectionVariantMap: { [sectionId]: sectionVariantAId },
      }),
      sections: { [sectionId]: sectionCore },
      sectionImpls: {
        [sectionImplAId]: createCallableSectionImpl({
          id: sectionImplAId,
          codeObjVariantMap: { [paramId]: paramVariantAId },
        }),
        [sectionImplBId]: createCallableSectionImpl({
          id: sectionImplBId,
          codeObjVariantMap: { [paramId]: paramVariantBId },
        }),
      },
      sectionVariants: {
        [sectionVariantAId]: sectionVariantA,
        [sectionVariantBId]: sectionVariantB,
      },
      codeObjs: { [paramId]: paramCore },
      codeObjImpls: {
        [paramImplAId]: createCodeParamCodeObjImpl({
          id: paramImplAId,
          value: "1",
        }),
        [paramImplBId]: createCodeParamCodeObjImpl({
          id: paramImplBId,
          value: "2",
        }),
      },
      codeObjVariants: {
        [paramVariantAId]: paramVariantA,
        [paramVariantBId]: paramVariantB,
      },
      artifactGroups: {},
      singletonSections: createSingletonSections(),
      parentSectionMap: { [sectionId]: null },
      shownParamIds: {},
      previewSectionVariantMap: {},
      requiredDecodedImages: [],
    } as ZustandProjectState);
    usePendingOperations.setState({ pending: [] });
    useNodeInternals.setState({ x: new Map() });
    useReactFlow.setState({
      transform: [0, 0, 1],
      fitViewOnInit: false,
      fitViewOnInitDone: true,
    });

    dispatchOptimisticProjectStateUpdate({
      apply: (state) => {
        setCodeObjVariantImplValue<BaseChildlessCodeObjImplUnion>(
          state,
          paramId,
          paramVariantAId,
          { value: "3" },
        );
      },
      send: () => new Promise(() => {}),
      projectConfigId: projectId,
    });

    expect(
      getCurrEffectiveCodeObjImplIfPresent(
        useProjectState.getState(),
        sectionId,
        paramId,
      )?.value,
    ).toBe("3");

    processProjectStateUpdateFromBackend({
      projectState: createSingleConfig({
        projectConfig: createProjectConfig({
          id: projectId,
          sectionVariantMap: { [sectionId]: sectionVariantBId },
        }),
        sections: { [sectionId]: sectionCore },
        sectionImpls: {
          [sectionImplAId]: createCallableSectionImpl({
            id: sectionImplAId,
            codeObjVariantMap: { [paramId]: paramVariantAId },
          }),
          [sectionImplBId]: createCallableSectionImpl({
            id: sectionImplBId,
            codeObjVariantMap: { [paramId]: paramVariantBId },
          }),
        },
        sectionVariants: {
          [sectionVariantAId]: sectionVariantA,
          [sectionVariantBId]: sectionVariantB,
        },
        codeObjs: { [paramId]: paramCore },
        codeObjImpls: {
          [paramImplAId]: createCodeParamCodeObjImpl({
            id: paramImplAId,
            value: "1",
          }),
          [paramImplBId]: createCodeParamCodeObjImpl({
            id: paramImplBId,
            value: "2",
          }),
        },
        codeObjVariants: {
          [paramVariantAId]: paramVariantA,
          [paramVariantBId]: paramVariantB,
        },
        artifactGroups: {},
        singletonSections: createSingletonSections(),
        parentSectionMap: { [sectionId]: null },
        shownParamIds: {},
        requiredDecodedImages: [],
        genCodeBinding: null,
      }),
      completedOpIds: [],
      pendingOpIds: [],
    });

    expect(
      useProjectState.getState().projectConfig.sectionVariantMap[sectionId],
    ).toBe(sectionVariantBId);
    expect(
      getCurrEffectiveCodeObjImplIfPresent(
        useProjectState.getState(),
        sectionId,
        paramId,
      )?.value,
    ).toBe("2");

    const stateWithOriginalVariantSelected = JSON.parse(
      JSON.stringify(useProjectState.getState()),
    ) as ZustandProjectState;
    stateWithOriginalVariantSelected.projectConfig.sectionVariantMap[
      sectionId
    ] = sectionVariantAId;
    expect(
      getCurrEffectiveCodeObjImplIfPresent(
        stateWithOriginalVariantSelected,
        sectionId,
        paramId,
      )?.value,
    ).toBe("3");
  });
});
