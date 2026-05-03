import {
  EDGE_STRIP_DATA_EDGE_HANDLE_EDGE_OFFSET_PX,
  resolveEdgeStripInputPortAnchorLocalPosition,
  resolveEdgeStripOutputPortAnchorLocalPosition,
} from "components/Params/edgeStripUtils";
import {
  EMPTY_GPU_FLOW_LAYOUT_NODES,
  useGpuFlowLayoutStoreNodes,
} from "gpuFlow/layoutHooks";
import {
  gpuFlowLayoutStore,
  type GpuFlowLayoutChange,
  type GpuFlowLayoutNode,
  type GpuFlowLayoutStoreApi,
} from "gpuFlow/layoutStore";
import type { GpuRetainedContentScrollOffsetMap } from "gpuFlow/retainedContentScroll";
import {
  createGpuFlowContentSurfacesFromSections,
  getGpuFlowSceneDomSectionNodes,
  type GpuFlowScene,
  type GpuPortAnchorDescriptor,
  type GpuSectionContentRendererDescriptor,
  type GpuSectionSceneChildLayout,
  type GpuSectionSceneLayoutMode,
  type GpuSectionSceneNode,
  type GpuSectionSceneResizePolicy,
} from "gpuFlow/scene";
import { resolveGpuFlowSceneLayout } from "gpuFlow/sceneLayout";
import {
  type GpuSectionSceneRevealRectResult,
  type GpuSectionSceneScrollOffsetMap,
} from "gpuFlow/sceneScroll";
import type { GpuRect } from "gpuFlow/viewportMath";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCurrEffectiveSectionImplIfPresent } from "state/actions/sectionInfos";
import { getActiveViewModeTopLevelSections } from "state/actions/sectionInfos/codeObjectsAndLayout";
import {
  buildTopLevelSectionNode,
  getPositiveTopLevelLayoutDimension,
  toTopLevelSectionOuterDimension,
} from "state/actions/sectionInfos/topLevelSectionNode";
import {
  getResizableEnable,
  getResizeAxisAvailability,
} from "state/actions/sections/sectionResizePolicy";
import {
  useLocalStorage,
  useProjectSearch,
  useProjectState,
  useResizeEvent,
  useSettings,
  useShareSession,
  useTypeErrors,
  type ZustandProjectSearch,
  type ZustandProjectState,
  type ZustandTypeErrors,
} from "state/definitions";
import { resolveSectionMinMaxDims } from "state/hooks/sectionSizes";
import { useShareCapabilities } from "state/hooks/share";
import {
  isBaseParentSectionImpl,
  isBaseSectionWithParamsImpl,
  ListRootViewModeEnum,
  SectionTypeEnum,
  type BaseSectionImplUnion,
  type GroupSectionImpl,
  type ListRootSectionImpl,
} from "utils/generatedTypes";
import { getProjectGpuLayoutNode } from "./projectGpuLayoutNodeAdapter";
import {
  createProjectGpuParamContentSurfaces,
  createProjectGpuParamDomIslands,
  DEFAULT_PROJECT_GPU_PARAM_EDIT_POLICY,
  type ProjectGpuActiveParamCanvasPopup,
  type ProjectGpuActiveParamDomIsland,
  type ProjectGpuParamEditPolicy,
  type ProjectGpuRetainedParamTarget,
} from "./projectGpuParamContentAdapter";
import { getProjectGpuParamFixedContentHeightForSection } from "./projectGpuParamContentHeight";
import type { ProjectGpuRetainedParamDragPreview } from "./projectGpuParamDragAdapter";
import type { ProjectGpuRetainedPasswordRevealStateMap } from "./projectGpuRetainedParamPasswordRevealState";
import {
  getProjectGpuSceneResizePolicyContext,
  getProjectSectionSceneResizeDirections,
  type ProjectGpuSceneResizePolicyContext,
} from "./projectGpuSceneResizePolicy";
import {
  resolveProjectGpuSceneSectionReveal,
  type ProjectGpuSceneRevealSectionOptions,
} from "./projectGpuSceneReveal";
import { getProjectGpuSceneRevision } from "./projectGpuSceneRevision";
import { resolveProjectGpuSectionAutoHeight } from "./projectGpuSectionAutoSize";
import {
  getProjectGpuRenderableTopLevelSectionIds,
  getRenderableProjectChildSectionIds,
  shouldRenderProjectSceneSection,
} from "./projectGpuSectionSceneTree";
import { getProjectSectionSceneHeaderHeight } from "./projectSectionSceneHeaderLayout";
import { getProjectSectionSceneKwargsControlsHeight } from "./projectSectionSceneKwargsControlsLayout";
import { getProjectSectionSceneLinkPortAnchors } from "./projectSectionSceneLinkAnchors";
import { getProjectSectionSceneSearchHeight } from "./projectSectionSceneSearchLayout";

export type {
  ProjectGpuActiveParamCanvasPopup,
  ProjectGpuActiveParamDomIsland,
  ProjectGpuRetainedParamTarget,
} from "./projectGpuParamContentAdapter";
type ContentScrollSetter = (offsets: GpuRetainedContentScrollOffsetMap) => void;

export type ProjectGpuLayoutAdapter = {
  readonly getContentScrollOffsets: () => GpuRetainedContentScrollOffsetMap;
  readonly layoutStore: GpuFlowLayoutStoreApi;
  readonly nodeLayouts: readonly GpuFlowLayoutNode[];
  readonly scene: GpuFlowScene;
  readonly sceneScrollOffsets: GpuSectionSceneScrollOffsetMap;
  readonly revealSceneSection: (
    sectionId: string,
    options?: ProjectGpuSceneRevealSectionOptions,
  ) => GpuSectionSceneRevealRectResult;
  readonly setSceneScrollOffsets: (
    scrollOffsets: GpuSectionSceneScrollOffsetMap,
  ) => void;
  readonly setContentScrollOffsets: ContentScrollSetter;
  readonly setTransientContentScrollOffsets: ContentScrollSetter;
};

type ProjectSectionSceneAspectRatioFields = {
  readonly aspectRatio?: boolean | null | undefined;
  readonly aspectRatioExtraHeight?: number | null | undefined;
  readonly aspectRatioExtraWidth?: number | null | undefined;
};
let projectGpuLayoutStoreSyncSubscriberCount = 0;
const DEFAULT_NESTED_SECTION_WIDTH = 250;
const DEFAULT_NESTED_SECTION_HEIGHT = 150;
const NESTED_VERTICAL_SECTION_GAP_PX = 8;
const NESTED_HORIZONTAL_SECTION_GAP_PX = 8;
const NESTED_KANBAN_SECTION_GAP_PX = 12;
const NESTED_KANBAN_SECTION_WIDTH_PX = 288;

type OptionalParamCanvasPopup =
  | ProjectGpuActiveParamCanvasPopup
  | null
  | undefined;
type OptionalParamDomIsland = ProjectGpuActiveParamDomIsland | null | undefined;
type OptionalParamDragPreview =
  | ProjectGpuRetainedParamDragPreview
  | null
  | undefined;
type OptionalParamTarget = ProjectGpuRetainedParamTarget | null | undefined;

export function useProjectGpuLayoutAdapter({
  activeParamCanvasControl,
  activeParamCanvasPopup,
  activeParamDomIsland,
  hoveredParamTarget,
  passwordRevealStates,
  retainedParamDragPreview,
}: {
  readonly activeParamCanvasControl?: OptionalParamTarget;
  readonly activeParamCanvasPopup?: OptionalParamCanvasPopup;
  readonly activeParamDomIsland?: OptionalParamDomIsland;
  readonly hoveredParamTarget?: OptionalParamTarget;
  readonly passwordRevealStates?:
    | ProjectGpuRetainedPasswordRevealStateMap
    | undefined;
  readonly retainedParamDragPreview?: OptionalParamDragPreview;
} = {}): ProjectGpuLayoutAdapter {
  const layoutStore = useProjectGpuLayoutStore();
  const [sceneScrollOffsets, setSceneScrollOffsets] =
    useState<GpuSectionSceneScrollOffsetMap>(() => new Map());
  const contentScrollOffsetsRef = useRef<GpuRetainedContentScrollOffsetMap>(
    new Map(),
  );
  const [contentScrollOffsetsVersion, setContentScrollOffsetsVersion] =
    useState(0);
  const projectState = useProjectState((state) => state);
  const darkMode = useLocalStorage((state) => state.darkMode);
  const sizingPolicy = useSettings((state) => state.sectionSizingPolicy);
  const resizeEventBySectionId = useResizeEvent((state) => state.resizeEvent);
  const typeErrors = useTypeErrors((state) => state.errors);
  const isDeploymentMode = useShareSession((state) => state.isDeploymentMode);
  const { canEditParams, canEditStructure } = useShareCapabilities();
  const projectSearchFocused = useProjectSearch((state) => state.focused);
  const projectSearchLookup = useProjectSearch((state) => state.lookup);
  const projectSearch = useMemo(
    () => ({ focused: projectSearchFocused, lookup: projectSearchLookup }),
    [projectSearchFocused, projectSearchLookup],
  );
  const scene = useMemo(
    () =>
      getProjectGpuFlowScene(projectState, {
        darkMode,
        resizePolicyContext: {
          resizeEventBySectionId,
          sizingPolicy,
        },
        revision: getProjectGpuSceneRevision(projectState),
        activeParamCanvasControl,
        activeParamCanvasPopup,
        activeParamDomIsland,
        contentScrollOffsets: contentScrollOffsetsRef.current,
        paramEditPolicy: {
          canEditParams,
          canEditStructure,
          isDeploymentMode,
        },
        hoveredParamTarget,
        passwordRevealStates,
        projectSearch,
        retainedParamDragPreview,
        scrollOffsets: sceneScrollOffsets,
        typeErrors,
      }),
    [
      activeParamCanvasControl,
      activeParamDomIsland,
      activeParamCanvasPopup,
      canEditParams,
      canEditStructure,
      contentScrollOffsetsVersion,
      darkMode,
      hoveredParamTarget,
      passwordRevealStates,
      isDeploymentMode,
      projectSearch,
      projectState,
      retainedParamDragPreview,
      resizeEventBySectionId,
      sceneScrollOffsets,
      sizingPolicy,
      typeErrors,
    ],
  );
  useProjectGpuLayoutStoreSceneSync(layoutStore, scene);
  const nodeLayouts =
    useGpuFlowLayoutStoreNodes(layoutStore) ?? EMPTY_GPU_FLOW_LAYOUT_NODES;
  const setNextSceneScrollOffsets = useCallback(
    (scrollOffsets: GpuSectionSceneScrollOffsetMap) => {
      setSceneScrollOffsets(new Map(scrollOffsets));
    },
    [],
  );
  const setNextContentScrollOffsets = useCallback(
    (scrollOffsets: GpuRetainedContentScrollOffsetMap) => {
      contentScrollOffsetsRef.current = new Map(scrollOffsets);
      setContentScrollOffsetsVersion((version) => version + 1);
    },
    [],
  );
  const setTransientContentScrollOffsets = useCallback(
    (scrollOffsets: GpuRetainedContentScrollOffsetMap) => {
      contentScrollOffsetsRef.current = new Map(scrollOffsets);
    },
    [],
  );
  const getContentScrollOffsets = useCallback(
    () => contentScrollOffsetsRef.current,
    [],
  );
  const revealSceneSection = useCallback(
    (
      sectionId: string,
      revealOptions?: ProjectGpuSceneRevealSectionOptions,
    ) => {
      const result = resolveProjectGpuSceneSectionReveal({
        ...revealOptions,
        scene,
        scrollOffsets: sceneScrollOffsets,
        sectionId,
      });
      if (result.changed) {
        setNextSceneScrollOffsets(result.scrollOffsets);
      }
      return result;
    },
    [scene, sceneScrollOffsets, setNextSceneScrollOffsets],
  );
  return useMemo(
    () => ({
      getContentScrollOffsets,
      layoutStore,
      nodeLayouts,
      revealSceneSection,
      scene,
      sceneScrollOffsets,
      setContentScrollOffsets: setNextContentScrollOffsets,
      setSceneScrollOffsets: setNextSceneScrollOffsets,
      setTransientContentScrollOffsets,
    }),
    [
      getContentScrollOffsets,
      layoutStore,
      nodeLayouts,
      revealSceneSection,
      scene,
      sceneScrollOffsets,
      setNextContentScrollOffsets,
      setNextSceneScrollOffsets,
      setTransientContentScrollOffsets,
    ],
  );
}

export function useProjectGpuLayoutStore(): GpuFlowLayoutStoreApi {
  const layoutStore = getProjectGpuLayoutStore();
  return layoutStore;
}

export function syncProjectGpuLayoutStoreFromScene(
  layoutStore: GpuFlowLayoutStoreApi,
  scene: GpuFlowScene,
): GpuFlowLayoutChange {
  return layoutStore
    .getState()
    .replaceNodes(getGpuFlowSceneDomSectionNodes(scene), {
      phase: "commit",
      reason: "project-sync",
    });
}

export function getProjectGpuFlowScene(
  projectState: ZustandProjectState,
  options: {
    readonly darkMode: boolean;
    readonly contentScrollOffsets?:
      | GpuRetainedContentScrollOffsetMap
      | undefined;
    readonly activeParamCanvasPopup?: OptionalParamCanvasPopup;
    readonly activeParamCanvasControl?: OptionalParamTarget;
    readonly activeParamDomIsland?: OptionalParamDomIsland;
    readonly hoveredParamTarget?: OptionalParamTarget;
    readonly passwordRevealStates?:
      | ProjectGpuRetainedPasswordRevealStateMap
      | undefined;
    readonly projectSearch?:
      | Pick<ZustandProjectSearch, "focused" | "lookup">
      | undefined;
    readonly paramEditPolicy?: ProjectGpuParamEditPolicy | undefined;
    readonly retainedParamDragPreview?: OptionalParamDragPreview;
    readonly resizePolicyContext?: ProjectGpuSceneResizePolicyContext;
    readonly revision?: number | undefined;
    readonly scrollOffsets?: GpuSectionSceneScrollOffsetMap | undefined;
    readonly typeErrors?: ZustandTypeErrors["errors"] | undefined;
  },
): GpuFlowScene {
  const sections: GpuSectionSceneNode[] = [];
  const seenSectionIds = new Set<string>();
  const topLevelSections = getActiveViewModeTopLevelSections(projectState);
  const resizePolicyContext =
    options.resizePolicyContext ?? getProjectGpuSceneResizePolicyContext();
  const paramEditPolicy =
    options.paramEditPolicy ?? DEFAULT_PROJECT_GPU_PARAM_EDIT_POLICY;

  for (const sectionId of getProjectGpuRenderableTopLevelSectionIds(
    projectState,
  )) {
    const layout = topLevelSections[sectionId];
    if (!layout) {
      continue;
    }
    const sectionImpl = getCurrEffectiveSectionImplIfPresent(
      projectState,
      sectionId,
    );
    if (!sectionImpl) {
      continue;
    }
    const node = getProjectGpuLayoutNode(
      buildTopLevelSectionNode({
        darkMode: options.darkMode,
        layout,
        sectionId,
        sectionImpl,
      }),
    );
    const worldRect = createRectFromTopLevelLayoutNode({
      layout,
      node,
      projectState,
      resizePolicyContext,
      sectionId,
      sectionImpl,
    });
    const sceneNode = createProjectSectionSceneNode({
      childSectionIds: getRenderableProjectChildSectionIds(
        projectState,
        sectionId,
        sectionImpl,
      ),
      contentRenderer: {
        kind: "dom-section",
        surfaceId: sectionId,
      },
      localRect: worldRect,
      node,
      parentSectionId: null,
      projectState,
      resizePolicyContext,
      sectionImpl,
      sectionId,
      scrollOffsets: options.scrollOffsets,
      worldRect,
    });
    pushProjectSectionSceneNode({
      sceneNode,
      sections,
      seenSectionIds,
    });
    appendProjectChildSectionSceneNodes({
      parentNode: sceneNode,
      projectState,
      resizePolicyContext,
      scrollOffsets: options.scrollOffsets,
      sections,
      seenSectionIds,
    });
  }

  const layoutScene = resolveGpuFlowSceneLayout({
    contentSurfaces: [],
    domIslands: [],
    edges: [],
    revision: options.revision ?? 0,
    sections,
  });
  const paramContentSurfaces = createProjectGpuParamContentSurfaces({
    activeParamCanvasControl: options.activeParamCanvasControl,
    activeParamCanvasPopup: options.activeParamCanvasPopup,
    activeParamDomIsland: options.activeParamDomIsland,
    contentScrollOffsets: options.contentScrollOffsets,
    editPolicy: paramEditPolicy,
    hoveredParamTarget: options.hoveredParamTarget,
    passwordRevealStates: options.passwordRevealStates,
    projectState,
    projectSearch: options.projectSearch,
    retainedParamDragPreview: options.retainedParamDragPreview,
    sections: layoutScene.sections,
    typeErrors: options.typeErrors,
  });
  return {
    ...layoutScene,
    domIslands: createProjectGpuParamDomIslands({
      activeParamDomIsland: options.activeParamDomIsland,
      contentSurfaces: paramContentSurfaces,
      editPolicy: paramEditPolicy,
      projectState,
    }),
    contentSurfaces: createGpuFlowContentSurfacesFromSections(
      layoutScene.sections,
      paramContentSurfaces,
    ),
  };
}

function getProjectGpuLayoutStore(): GpuFlowLayoutStoreApi {
  if (projectGpuLayoutStoreSyncSubscriberCount === 0) {
    const projectState = useProjectState.getState();
    syncProjectGpuLayoutStoreFromScene(
      gpuFlowLayoutStore,
      getProjectGpuFlowScene(projectState, {
        darkMode: useLocalStorage.getState().darkMode,
        projectSearch: useProjectSearch.getState(),
        revision: getProjectGpuSceneRevision(projectState),
        typeErrors: useTypeErrors.getState().errors,
      }),
    );
  }
  return gpuFlowLayoutStore;
}

function useProjectGpuLayoutStoreSceneSync(
  layoutStore: GpuFlowLayoutStoreApi,
  scene: GpuFlowScene,
) {
  useEffect(() => {
    projectGpuLayoutStoreSyncSubscriberCount += 1;
    syncProjectGpuLayoutStoreFromScene(layoutStore, scene);
    return () => {
      projectGpuLayoutStoreSyncSubscriberCount = Math.max(
        0,
        projectGpuLayoutStoreSyncSubscriberCount - 1,
      );
    };
  }, [layoutStore, scene]);
}

function appendProjectChildSectionSceneNodes({
  parentNode,
  projectState,
  resizePolicyContext,
  scrollOffsets,
  sections,
  seenSectionIds,
}: {
  readonly parentNode: GpuSectionSceneNode;
  readonly projectState: ZustandProjectState;
  readonly resizePolicyContext: ProjectGpuSceneResizePolicyContext;
  readonly scrollOffsets?: GpuSectionSceneScrollOffsetMap | undefined;
  readonly sections: GpuSectionSceneNode[];
  readonly seenSectionIds: Set<string>;
}) {
  parentNode.childSectionIds.forEach((childSectionId) => {
    if (!shouldRenderProjectSceneSection(projectState, childSectionId)) {
      return;
    }
    const childImpl = getCurrEffectiveSectionImplIfPresent(
      projectState,
      childSectionId,
    );
    if (!childImpl) {
      return;
    }
    const localRect = createProjectNestedSectionInitialLocalRect({
      parentLayoutMode: parentNode.layoutMode,
      sectionImpl: childImpl,
    });
    const childNode = createProjectSectionSceneNode({
      childSectionIds: getRenderableProjectChildSectionIds(
        projectState,
        childSectionId,
        childImpl,
      ),
      contentRenderer: { kind: "dom-section", surfaceId: childSectionId },
      localRect,
      node: {
        height: localRect.height,
        nodeId: childSectionId,
        tempZIndex: parentNode.tempZIndex,
        width: localRect.width,
        x: localRect.x,
        y: localRect.y,
        zIndex: parentNode.zIndex,
      },
      parentSectionId: parentNode.sectionId,
      projectState,
      resizePolicyContext,
      sectionImpl: childImpl,
      sectionId: childSectionId,
      scrollOffsets,
      worldRect: localRect,
    });
    pushProjectSectionSceneNode({
      sceneNode: childNode,
      sections,
      seenSectionIds,
    });
    appendProjectChildSectionSceneNodes({
      parentNode: childNode,
      projectState,
      resizePolicyContext,
      scrollOffsets,
      sections,
      seenSectionIds,
    });
  });
}

function createProjectSectionSceneNode({
  childSectionIds,
  contentRenderer,
  localRect,
  node,
  parentSectionId,
  projectState,
  resizePolicyContext,
  sectionId,
  sectionImpl,
  scrollOffsets,
  worldRect,
}: {
  readonly childSectionIds: readonly string[];
  readonly contentRenderer: GpuSectionContentRendererDescriptor;
  readonly localRect: GpuRect;
  readonly node: GpuFlowLayoutNode;
  readonly parentSectionId: string | null;
  readonly projectState: ZustandProjectState;
  readonly resizePolicyContext: ProjectGpuSceneResizePolicyContext;
  readonly sectionId: string;
  readonly sectionImpl: BaseSectionImplUnion;
  readonly scrollOffsets?: GpuSectionSceneScrollOffsetMap | undefined;
  readonly worldRect: GpuRect;
}): GpuSectionSceneNode {
  const bodyRect = worldRect;
  const childViewportRect = childSectionIds.length > 0 ? bodyRect : null;
  const layoutMode = getProjectSectionSceneLayoutMode(sectionImpl);
  return {
    ...node,
    bodyRect,
    childLayout: getProjectSectionSceneChildLayout(layoutMode),
    childSectionIds,
    childViewportRect,
    chromeRect: worldRect,
    clipRect: worldRect,
    contentRenderer,
    dirty: [],
    interactionLayer: "content",
    layoutMode,
    localRect,
    parentSectionId,
    portAnchors: getProjectSectionScenePortAnchors({
      projectState,
      sectionId,
      sectionImpl,
      worldRect,
    }),
    resizePolicy: getProjectSectionSceneResizePolicy({
      projectState,
      resizePolicyContext,
      sectionId,
      sectionImpl,
    }),
    scrollOffset: scrollOffsets?.get(sectionId) ?? { x: 0, y: 0 },
    sectionId,
    worldRect,
  };
}

function getProjectSectionScenePortAnchors({
  projectState,
  sectionId,
  sectionImpl,
  worldRect,
}: {
  readonly projectState: ZustandProjectState;
  readonly sectionId: string;
  readonly sectionImpl: BaseSectionImplUnion;
  readonly worldRect: GpuRect;
}): readonly GpuPortAnchorDescriptor[] {
  return [
    ...getProjectSectionSceneDataPortAnchors({
      sectionImpl,
      worldRect,
    }),
    ...getProjectSectionSceneLinkPortAnchors({
      projectState,
      sectionId,
      sectionImpl,
      worldRect,
    }),
  ];
}

function getProjectSectionSceneDataPortAnchors({
  sectionImpl,
  worldRect,
}: {
  readonly sectionImpl: BaseSectionImplUnion;
  readonly worldRect: GpuRect;
}): readonly GpuPortAnchorDescriptor[] {
  if (!isBaseSectionWithParamsImpl(sectionImpl)) {
    return [];
  }

  if (!sectionImpl.isMinimized) {
    return getProjectSectionSceneEdgeStripPortAnchors({
      sectionImpl,
      worldRect,
    });
  }

  const anchorY = worldRect.height / 2;
  const minimizedInputX = -EDGE_STRIP_DATA_EDGE_HANDLE_EDGE_OFFSET_PX;
  const minimizedOutputX =
    worldRect.width + EDGE_STRIP_DATA_EDGE_HANDLE_EDGE_OFFSET_PX;
  return [
    ...(sectionImpl.edgeInputParams ?? []).map((paramId) => ({
      id: paramId,
      kind: "input" as const,
      localPosition: { x: minimizedInputX, y: anchorY },
    })),
    ...(sectionImpl.edgeOutputPorts ?? []).map((port) => ({
      id: port.id,
      kind: "output" as const,
      localPosition: { x: minimizedOutputX, y: anchorY },
    })),
  ];
}

function getProjectSectionSceneEdgeStripPortAnchors({
  sectionImpl,
  worldRect,
}: {
  readonly sectionImpl: BaseSectionImplUnion & {
    readonly edgeInputParams?: readonly string[] | null;
    readonly edgeOutputPorts?: readonly { readonly id: string }[] | null;
  };
  readonly worldRect: GpuRect;
}): readonly GpuPortAnchorDescriptor[] {
  const stripLocalY = getProjectSectionSceneEdgeStripLocalY({
    sectionImpl,
  });
  return [
    ...(sectionImpl.edgeInputParams ?? []).map((paramId, portIndex) => ({
      id: paramId,
      kind: "input" as const,
      localPosition: resolveEdgeStripInputPortAnchorLocalPosition({
        portIndex,
        stripLocalY,
      }),
    })),
    ...(sectionImpl.edgeOutputPorts ?? []).map((port, portIndex) => ({
      id: port.id,
      kind: "output" as const,
      localPosition: resolveEdgeStripOutputPortAnchorLocalPosition({
        portIndex,
        sectionWidth: worldRect.width,
        stripLocalY,
      }),
    })),
  ];
}

function getProjectSectionSceneEdgeStripLocalY({
  sectionImpl,
}: {
  readonly sectionImpl: BaseSectionImplUnion;
}): number {
  return (
    getProjectSectionSceneHeaderHeight() +
    getProjectSectionSceneSearchHeight(sectionImpl) +
    getProjectSectionSceneKwargsControlsHeight(sectionImpl)
  );
}

function getProjectSectionSceneResizePolicy({
  projectState,
  resizePolicyContext,
  sectionId,
  sectionImpl,
}: {
  readonly projectState: ZustandProjectState;
  readonly resizePolicyContext: ProjectGpuSceneResizePolicyContext;
  readonly sectionId: string;
  readonly sectionImpl: BaseSectionImplUnion;
}): GpuSectionSceneResizePolicy {
  const dimensions = resolveSectionMinMaxDims({
    sectionId,
    projectState,
    sizingPolicy: resizePolicyContext.sizingPolicy,
    resizeEvent: resizePolicyContext.resizeEventBySectionId[sectionId],
    measuredHeights: {
      kwargsControlsHeight:
        getProjectSectionSceneKwargsControlsHeight(sectionImpl),
      paramsFixedHeight: getProjectSectionSceneParamsFixedHeight({
        projectState,
        sectionId,
        sectionImpl,
      }),
      sectionHeaderHeight: getProjectSectionSceneHeaderHeight(),
      sectionSearchHeight: getProjectSectionSceneSearchHeight(sectionImpl),
    },
  });
  const { heightResizable, widthResizable } = getResizeAxisAvailability({
    maxHeight: dimensions.maxHeight,
    maxWidth: dimensions.maxWidth,
    minHeight: dimensions.minHeight,
    minWidth: dimensions.minWidth,
    sizeMode: dimensions.sizeMode,
  });
  const enable = getResizableEnable({
    disablePointerEvents: false,
    positionAndSizeLocked: sectionImpl.positionAndSizeLocked,
    heightResizable,
    widthResizable,
  });
  const aspectRatioFields = sectionImpl as BaseSectionImplUnion &
    ProjectSectionSceneAspectRatioFields;
  return {
    aspectRatio:
      !sectionImpl.isMinimized && Boolean(aspectRatioFields.aspectRatio),
    aspectRatioExtraHeight: aspectRatioFields.aspectRatioExtraHeight ?? 0,
    aspectRatioExtraWidth: aspectRatioFields.aspectRatioExtraWidth ?? 0,
    directions: enable ? getProjectSectionSceneResizeDirections(enable) : [],
    locked: sectionImpl.positionAndSizeLocked,
    maxHeight: toTopLevelSectionOuterDimension(dimensions.maxHeight),
    maxWidth: toTopLevelSectionOuterDimension(dimensions.maxWidth),
    minHeight: toTopLevelSectionOuterDimension(dimensions.minHeight),
    minWidth: toTopLevelSectionOuterDimension(dimensions.minWidth),
  };
}

function getProjectSectionSceneParamsFixedHeight({
  projectState,
  sectionId,
  sectionImpl,
}: {
  readonly projectState: ZustandProjectState;
  readonly sectionId: string;
  readonly sectionImpl: BaseSectionImplUnion;
}): number {
  return getProjectGpuParamFixedContentHeightForSection({
    projectState,
    sectionId,
    sectionImpl,
  });
}

function pushProjectSectionSceneNode({
  sceneNode,
  sections,
  seenSectionIds,
}: {
  readonly sceneNode: GpuSectionSceneNode;
  readonly sections: GpuSectionSceneNode[];
  readonly seenSectionIds: Set<string>;
}) {
  if (seenSectionIds.has(sceneNode.sectionId)) {
    throw new Error(`Duplicate section scene node ${sceneNode.sectionId}.`);
  }
  seenSectionIds.add(sceneNode.sectionId);
  sections.push(sceneNode);
}

function getProjectSectionSceneLayoutMode(
  sectionImpl: BaseSectionImplUnion,
): GpuSectionSceneLayoutMode {
  if (isProjectGroupSectionImpl(sectionImpl)) {
    return sectionImpl.isHorizontalOrientation ? "horizontal" : "vertical";
  }
  if (isProjectListRootSectionImpl(sectionImpl)) {
    return sectionImpl.viewMode === ListRootViewModeEnum.kanban
      ? "kanban"
      : "vertical";
  }
  if (isBaseParentSectionImpl(sectionImpl)) {
    return "vertical";
  }
  return "none";
}

function isProjectGroupSectionImpl(
  sectionImpl: BaseSectionImplUnion,
): sectionImpl is GroupSectionImpl {
  return sectionImpl.type === SectionTypeEnum.Group;
}

function isProjectListRootSectionImpl(
  sectionImpl: BaseSectionImplUnion,
): sectionImpl is ListRootSectionImpl {
  return sectionImpl.type === SectionTypeEnum.ListRoot;
}

function createProjectNestedSectionInitialLocalRect({
  parentLayoutMode,
  sectionImpl,
}: {
  readonly parentLayoutMode: GpuSectionSceneLayoutMode;
  readonly sectionImpl: BaseSectionImplUnion;
}): GpuRect {
  return {
    ...getProjectNestedSectionSceneSize(sectionImpl, parentLayoutMode),
    x: 0,
    y: 0,
  };
}

function getProjectNestedSectionSceneSize(
  sectionImpl: BaseSectionImplUnion,
  layoutMode: GpuSectionSceneLayoutMode,
): { readonly height: number; readonly width: number } {
  return {
    height: resolveProjectSectionSceneDimension(
      sectionImpl.size.height,
      DEFAULT_NESTED_SECTION_HEIGHT,
    ),
    width: resolveProjectSectionSceneDimension(
      sectionImpl.size.width,
      layoutMode === "kanban"
        ? NESTED_KANBAN_SECTION_WIDTH_PX
        : DEFAULT_NESTED_SECTION_WIDTH,
    ),
  };
}

function getProjectNestedSectionGap(
  layoutMode: GpuSectionSceneLayoutMode,
): number {
  if (layoutMode === "kanban") {
    return NESTED_KANBAN_SECTION_GAP_PX;
  }
  if (layoutMode === "horizontal") {
    return NESTED_HORIZONTAL_SECTION_GAP_PX;
  }
  return NESTED_VERTICAL_SECTION_GAP_PX;
}

function getProjectSectionSceneChildLayout(
  layoutMode: GpuSectionSceneLayoutMode,
): GpuSectionSceneChildLayout {
  const gap = getProjectNestedSectionGap(layoutMode);
  if (layoutMode === "horizontal" || layoutMode === "kanban") {
    return { gap: { x: gap, y: 0 } };
  }
  if (layoutMode === "vertical") {
    return { gap: { x: 0, y: gap } };
  }
  return { gap: { x: 0, y: 0 } };
}

function createRectFromTopLevelLayoutNode({
  layout,
  node,
  projectState,
  resizePolicyContext,
  sectionId,
  sectionImpl,
}: {
  readonly layout: ReturnType<typeof getActiveViewModeTopLevelSections>[string];
  readonly node: GpuFlowLayoutNode;
  readonly projectState: ZustandProjectState;
  readonly resizePolicyContext: ProjectGpuSceneResizePolicyContext;
  readonly sectionId: string;
  readonly sectionImpl: BaseSectionImplUnion;
}): GpuRect {
  const autoHeight = resolveProjectGpuSectionAutoHeightDimension({
    projectState,
    resizePolicyContext,
    sectionId,
    sectionImpl,
  });
  return {
    height:
      autoHeight ??
      node.height ??
      getPositiveTopLevelLayoutDimension(layout.h) ??
      resolveProjectSectionSceneDimension(
        sectionImpl.size.height,
        DEFAULT_NESTED_SECTION_HEIGHT,
      ),
    width:
      node.width ??
      getPositiveTopLevelLayoutDimension(layout.w) ??
      resolveProjectSectionSceneDimension(
        sectionImpl.size.width,
        DEFAULT_NESTED_SECTION_WIDTH,
      ),
    x: node.x,
    y: node.y,
  };
}

function resolveProjectGpuSectionAutoHeightDimension({
  projectState,
  resizePolicyContext,
  sectionId,
  sectionImpl,
}: {
  readonly projectState: ZustandProjectState;
  readonly resizePolicyContext: ProjectGpuSceneResizePolicyContext;
  readonly sectionId: string;
  readonly sectionImpl: BaseSectionImplUnion;
}): number | null {
  const autoHeight = resolveProjectGpuSectionAutoHeight({
    projectState,
    sectionId,
    sectionImpl,
  });
  if (autoHeight === null) {
    return null;
  }
  const dimensions = resolveSectionMinMaxDims({
    sectionId,
    projectState,
    sizingPolicy: resizePolicyContext.sizingPolicy,
    resizeEvent: resizePolicyContext.resizeEventBySectionId[sectionId],
    measuredHeights: {
      kwargsControlsHeight:
        getProjectSectionSceneKwargsControlsHeight(sectionImpl),
      paramsFixedHeight: getProjectSectionSceneParamsFixedHeight({
        projectState,
        sectionId,
        sectionImpl,
      }),
      sectionHeaderHeight: getProjectSectionSceneHeaderHeight(),
      sectionSearchHeight: getProjectSectionSceneSearchHeight(sectionImpl),
    },
  });
  return clampProjectGpuSectionSceneDimension(
    autoHeight,
    toTopLevelSectionOuterDimension(dimensions.minHeight),
    toTopLevelSectionOuterDimension(dimensions.maxHeight),
  );
}

function clampProjectGpuSectionSceneDimension(
  value: number,
  min: number,
  max: number,
): number {
  return Math.max(min, Math.min(value, max));
}

function resolveProjectSectionSceneDimension(
  value: unknown,
  fallback: number,
): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}
