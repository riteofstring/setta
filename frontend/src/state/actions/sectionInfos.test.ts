import { useReactFlow } from "forks/xyflow/core/store";
import * as chatMergeUtils from "state/actions/chatMergeUtils";
import {
  createNodesMapFromProjectConfigChildren,
  createTopLevelSectionLayoutDict,
  getAttachedTerminalParentIdForTerminalSection,
  getCurrShownParamIds,
  getEmbeddedAttachedTerminalForCodeSection,
  getEmbeddedAttachedTerminalParentIdForTerminalSection,
  processProjectStateUpdateFromBackend,
} from "state/actions/sectionInfos";
import { resetStreamingTracker } from "state/aiStreamingTracker";
import {
  useMisc,
  useNodeInternals,
  usePendingOperations,
  useProjectState,
  type ZustandProjectState,
} from "state/definitions";
import {
  ChatRoleEnum,
  createChatSectionImpl,
  createCodeSectionImpl,
  createCore,
  createMessageTextContent,
  createProjectConfig,
  createSingletonSections,
  createTerminalSectionImpl,
  createUserDefaultChatSectionImpl,
  createVariant,
  SectionTypeEnum,
  type ProjectStateSingleConfigWithCompletedOpIds,
  type ShownParamIds,
  type ViewModeConfig,
} from "utils/generatedTypes";
import { describe, expect, it, vi } from "vitest";

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
    const viewModeId = "view-1";
    const layout = { x: 0, y: 0, zIndex: 0, w: 200, h: 160 };
    const projectConfig = createProjectConfig({
      id: "project-1",
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
    const viewModeId = "view-1";
    const layout = { x: 0, y: 0, zIndex: 0, w: 200, h: 160 };
    const projectConfig = createProjectConfig({
      id: "project-1",
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
    } as ZustandProjectState;

    const nodesMap = createNodesMapFromProjectConfigChildren(
      projectState,
      new Map(),
    );

    expect(nodesMap.has(sectionVisible)).toBe(true);
    expect(nodesMap.has(sectionHidden)).toBe(false);
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
});
