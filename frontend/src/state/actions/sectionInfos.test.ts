import * as endpoints from "openapi/http";
import {
  getAttachedTerminalParentIdForTerminalSection,
  getCurrCodeObjVariantIfPresent,
  getCurrEffectiveCodeObjImplIfPresent,
  getCurrEffectiveCodeObjImplWithTypeGuardIfPresent,
  getCurrEffectiveSectionImpl,
  getCurrShownParamIds,
  getEmbeddedAttachedTerminalForCodeSection,
  getEmbeddedAttachedTerminalParentIdForTerminalSection,
  getParamDisplayNameIfPresent,
  getSectionIsHorizontalOrientation,
  setCurrEffectiveSectionImplValue,
  unselectAllParams,
  updateAllProjectMetadata,
} from "state/actions/sectionInfos";
import {
  useAllProjectMetadata,
  usePendingOperations,
  useProjectState,
  type ZustandProjectState,
} from "state/definitions";
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
  createSingletonSections,
  createTerminalSectionImpl,
  createVariant,
  ListRootViewModeEnum,
  SectionTypeEnum,
  type ShownParamIDs,
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
