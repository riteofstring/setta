import { gpuFlowViewportStore } from "gpuFlow/viewportStore";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveCodeObjImplIfPresent,
  processProjectStateUpdateFromBackend,
  setCodeObjVariantImplValue,
} from "state/actions/sectionInfos";
import {
  useMisc,
  useNodeInternals,
  usePendingOperations,
  useProjectState,
  type ZustandProjectState,
} from "state/definitions";
import type { ProjectStateBackendUpdate } from "testUtils/projectStateBackendUpdate";
import {
  createCallableSectionImpl,
  createCodeParamCodeObjImpl,
  createCore,
  createProjectConfig,
  createSectionCapabilities,
  createSingleConfig,
  createSingletonSections,
  createVariant,
  type BaseChildlessCodeObjImplUnion,
  type ViewMode,
} from "utils/generatedTypes";
import { describe, expect, it, vi } from "vitest";

describe("processProjectStateUpdateFromBackend", () => {
  it("publishes backend updates when only section capabilities change", () => {
    const projectConfig = createProjectConfig({
      id: "project-1",
    });
    const baseProjectState = createSingleConfig({
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
      sectionCapabilities: {},
    });
    useProjectState.setState(baseProjectState);
    usePendingOperations.setState({ pending: [] });

    processProjectStateUpdateFromBackend({
      projectState: createSingleConfig({
        ...baseProjectState,
        sectionCapabilities: {
          "code-section": createSectionCapabilities({
            canRun: true,
            runDisabledReason: null,
          }),
        },
      }),
      completedOpIds: [],
      pendingOpIds: [],
    });

    expect(
      useProjectState.getState().sectionCapabilities["code-section"]?.canRun,
    ).toBe(true);
  });

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
    gpuFlowViewportStore.getState().setTransform([0, 0, 1]);
    gpuFlowViewportStore.getState().setFitViewInitializationState({
      fitViewOnInit: false,
      fitViewOnInitDone: true,
      fitViewOnInitOptions: undefined,
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

    expect(gpuFlowViewportStore.getState().transform).toEqual([10, -20, 1.5]);
    expect(gpuFlowViewportStore.getState().fitViewOnInit).toBe(false);
    expect(gpuFlowViewportStore.getState().fitViewOnInitDone).toBe(true);
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
    gpuFlowViewportStore.getState().setFitViewInitializationState({
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

    const gpuViewportState = gpuFlowViewportStore.getState();
    expect(gpuViewportState.fitViewOnInit).toBe(true);
    expect(gpuViewportState.fitViewOnInitDone).toBe(false);
    expect(gpuViewportState.fitViewOnInitOptions?.nodes).toEqual([
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
    gpuFlowViewportStore.getState().setFitViewInitializationState({
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

    const gpuViewportState = gpuFlowViewportStore.getState();
    expect(gpuViewportState.fitViewOnInit).toBe(true);
    expect(gpuViewportState.fitViewOnInitDone).toBe(false);
    expect(gpuViewportState.fitViewOnInitOptions?.nodes).toEqual([
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
    gpuFlowViewportStore.getState().setFitViewInitializationState({
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

    const gpuViewportState = gpuFlowViewportStore.getState();
    expect(gpuViewportState.fitViewOnInit).toBe(true);
    expect(gpuViewportState.fitViewOnInitDone).toBe(false);
    expect(gpuViewportState.fitViewOnInitOptions?.nodes).toEqual([
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
    gpuFlowViewportStore.getState().setFitViewInitializationState({
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
    gpuFlowViewportStore.getState().setTransform([0, 0, 1]);
    gpuFlowViewportStore.getState().setFitViewInitializationState({
      fitViewOnInit: false,
      fitViewOnInitDone: true,
      fitViewOnInitOptions: undefined,
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
    gpuFlowViewportStore.getState().setTransform([0, 0, 1]);
    gpuFlowViewportStore.getState().setFitViewInitializationState({
      fitViewOnInit: false,
      fitViewOnInitDone: true,
      fitViewOnInitOptions: undefined,
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
    gpuFlowViewportStore.getState().setTransform([0, 0, 1]);
    gpuFlowViewportStore.getState().setFitViewInitializationState({
      fitViewOnInit: false,
      fitViewOnInitDone: true,
      fitViewOnInitOptions: undefined,
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
