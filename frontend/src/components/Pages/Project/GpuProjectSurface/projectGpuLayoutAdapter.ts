import type { Node } from "gpuFlow/flowTypes";
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
import type { GpuNodeResizeDirection } from "gpuFlow/resizeHandles";
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
  resolveGpuSectionSceneRevealRect,
  type GpuSectionSceneRevealRectAlignment,
  type GpuSectionSceneRevealRectResult,
  type GpuSectionSceneScrollOffsetMap,
} from "gpuFlow/sceneScroll";
import type { GpuRect } from "gpuFlow/viewportMath";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getCurrEffectiveSectionImplIfPresent,
  getEmbeddedAttachedTerminalForCodeSection,
  getSectionShouldRender,
  getTopLevelSectionIdsForDisplay,
} from "state/actions/sectionInfos";
import {
  getActiveViewModeTopLevelSections,
  shouldRenderTopLevelSectionNode,
} from "state/actions/sectionInfos/codeObjectsAndLayout";
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
  useProjectState,
  useResizeEvent,
  useSettings,
  useTemporaryMiscState,
  type ZustandProjectState,
} from "state/definitions";
import { resolveSectionMinMaxDims } from "state/hooks/sectionSizes";
import {
  getKwargsControlsHeightKey,
  getParamsFixedHeightKey,
  getSectionHeaderHeightKey,
  getSectionSearchHeightKey,
} from "utils/constants";
import {
  isBaseParentSectionImpl,
  isBaseSectionWithParamsImpl,
  ListRootViewModeEnum,
  SectionTypeEnum,
  type BaseSectionImplUnion,
  type GroupSectionImpl,
  type ListRootSectionImpl,
  type SectionSizingPolicy,
} from "utils/generatedTypes";
import {
  createProjectGpuParamContentSurfaces,
  createProjectGpuParamDomIslands,
  type ProjectGpuActiveParamDomIsland,
  type ProjectGpuRetainedParamTarget,
} from "./projectGpuParamContentAdapter";
import type { ProjectGpuRetainedParamDragPreview } from "./projectGpuParamDragAdapter";

export type {
  ProjectGpuActiveParamDomIsland,
  ProjectGpuRetainedParamTarget,
} from "./projectGpuParamContentAdapter";

export type ProjectGpuLayoutAdapter = {
  readonly contentScrollOffsets: GpuRetainedContentScrollOffsetMap;
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
  readonly setContentScrollOffsets: (
    scrollOffsets: GpuRetainedContentScrollOffsetMap,
  ) => void;
};

export type ProjectGpuSceneRevealSectionOptions = {
  readonly align?: GpuSectionSceneRevealRectAlignment | undefined;
  readonly marginPx?: number | undefined;
};

type ProjectGpuSceneResizePolicyContext = {
  readonly measuredHeightsByKey: Readonly<Record<string, unknown>>;
  readonly resizeEventBySectionId: Readonly<Record<string, string | undefined>>;
  readonly sizingPolicy: SectionSizingPolicy;
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
const MINIMIZED_DATA_EDGE_HANDLE_EDGE_OFFSET_PX = 1;

export function useProjectGpuLayoutAdapter({
  activeParamDomIsland,
  hoveredParamTarget,
  retainedParamDragPreview,
}: {
  readonly activeParamDomIsland?:
    | ProjectGpuActiveParamDomIsland
    | null
    | undefined;
  readonly hoveredParamTarget?:
    | ProjectGpuRetainedParamTarget
    | null
    | undefined;
  readonly retainedParamDragPreview?:
    | ProjectGpuRetainedParamDragPreview
    | null
    | undefined;
} = {}): ProjectGpuLayoutAdapter {
  const layoutStore = useProjectGpuLayoutStore();
  const [sceneScrollOffsets, setSceneScrollOffsets] =
    useState<GpuSectionSceneScrollOffsetMap>(() => new Map());
  const [contentScrollOffsets, setContentScrollOffsets] =
    useState<GpuRetainedContentScrollOffsetMap>(() => new Map());
  const projectState = useProjectState((state) => state);
  const darkMode = useLocalStorage((state) => state.darkMode);
  const sizingPolicy = useSettings((state) => state.sectionSizingPolicy);
  const resizeEventBySectionId = useResizeEvent((state) => state.resizeEvent);
  const measuredHeightsByKey = useTemporaryMiscState((state) => state);
  const scene = useMemo(
    () =>
      getProjectGpuFlowScene(projectState, {
        darkMode,
        resizePolicyContext: {
          measuredHeightsByKey,
          resizeEventBySectionId,
          sizingPolicy,
        },
        revision: getProjectGpuSceneRevision(projectState),
        activeParamDomIsland,
        contentScrollOffsets,
        hoveredParamTarget,
        retainedParamDragPreview,
        scrollOffsets: sceneScrollOffsets,
      }),
    [
      activeParamDomIsland,
      contentScrollOffsets,
      darkMode,
      hoveredParamTarget,
      measuredHeightsByKey,
      projectState,
      retainedParamDragPreview,
      resizeEventBySectionId,
      sceneScrollOffsets,
      sizingPolicy,
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
      setContentScrollOffsets(new Map(scrollOffsets));
    },
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
      contentScrollOffsets,
      layoutStore,
      nodeLayouts,
      revealSceneSection,
      scene,
      sceneScrollOffsets,
      setContentScrollOffsets: setNextContentScrollOffsets,
      setSceneScrollOffsets: setNextSceneScrollOffsets,
    }),
    [
      contentScrollOffsets,
      layoutStore,
      nodeLayouts,
      revealSceneSection,
      scene,
      sceneScrollOffsets,
      setNextContentScrollOffsets,
      setNextSceneScrollOffsets,
    ],
  );
}

export function resolveProjectGpuSceneSectionReveal({
  align,
  marginPx,
  scene,
  scrollOffsets,
  sectionId,
}: ProjectGpuSceneRevealSectionOptions & {
  readonly scene: GpuFlowScene;
  readonly scrollOffsets: GpuSectionSceneScrollOffsetMap;
  readonly sectionId: string;
}): GpuSectionSceneRevealRectResult {
  const section = getProjectGpuSceneSectionById(scene, sectionId);
  return resolveGpuSectionSceneRevealRect({
    align,
    marginPx,
    parentSectionId: section.parentSectionId,
    rect: section.localRect,
    scene,
    scrollOffsets,
  });
}

function getProjectGpuSceneSectionById(
  scene: GpuFlowScene,
  sectionId: string,
): GpuSectionSceneNode {
  const section = scene.sections.find(
    (candidate) => candidate.sectionId === sectionId,
  );
  if (!section) {
    throw new Error(`Missing project GPU scene section ${sectionId}.`);
  }
  return section;
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
    readonly activeParamDomIsland?:
      | ProjectGpuActiveParamDomIsland
      | null
      | undefined;
    readonly hoveredParamTarget?:
      | ProjectGpuRetainedParamTarget
      | null
      | undefined;
    readonly retainedParamDragPreview?:
      | ProjectGpuRetainedParamDragPreview
      | null
      | undefined;
    readonly resizePolicyContext?: ProjectGpuSceneResizePolicyContext;
    readonly revision?: number | undefined;
    readonly scrollOffsets?: GpuSectionSceneScrollOffsetMap | undefined;
  },
): GpuFlowScene {
  const sections: GpuSectionSceneNode[] = [];
  const seenSectionIds = new Set<string>();
  const topLevelSections = getActiveViewModeTopLevelSections(projectState);
  const activeViewModeId = projectState.projectConfig.activeViewModeId;
  const resizePolicyContext =
    options.resizePolicyContext ?? getProjectGpuSceneResizePolicyContext();
  const canFilterByView = Boolean(
    activeViewModeId && projectState.projectConfig.viewModes[activeViewModeId],
  );

  for (const sectionId of getTopLevelSectionIdsForDisplay(projectState)) {
    const layout = topLevelSections[sectionId];
    if (
      !layout ||
      !shouldRenderTopLevelSectionNode(projectState, sectionId, canFilterByView)
    ) {
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
    const worldRect = createRectFromTopLevelLayoutNode(
      node,
      sectionImpl,
      layout,
    );
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
    activeParamDomIsland: options.activeParamDomIsland,
    contentScrollOffsets: options.contentScrollOffsets,
    hoveredParamTarget: options.hoveredParamTarget,
    measuredHeightsByKey: resizePolicyContext.measuredHeightsByKey,
    projectState,
    retainedParamDragPreview: options.retainedParamDragPreview,
    sections: layoutScene.sections,
  });
  return {
    ...layoutScene,
    domIslands: createProjectGpuParamDomIslands({
      activeParamDomIsland: options.activeParamDomIsland,
      contentSurfaces: paramContentSurfaces,
      projectState,
    }),
    contentSurfaces: createGpuFlowContentSurfacesFromSections(
      layoutScene.sections,
      paramContentSurfaces,
    ),
  };
}

export function getProjectGpuLayoutNodesFromNodeInternals(state: {
  readonly x: ReadonlyMap<string, Node>;
}): readonly GpuFlowLayoutNode[] {
  return Array.from(state.x.values(), getProjectGpuLayoutNode);
}

export function getProjectGpuLayoutNode(node: Node): GpuFlowLayoutNode {
  return {
    height: node.height,
    nodeId: node.id,
    tempZIndex: node.tempZIndex,
    width: node.width,
    x: node.position.x,
    y: node.position.y,
    zIndex: node.zIndex,
  };
}

function getProjectGpuLayoutStore(): GpuFlowLayoutStoreApi {
  if (projectGpuLayoutStoreSyncSubscriberCount === 0) {
    const projectState = useProjectState.getState();
    syncProjectGpuLayoutStoreFromScene(
      gpuFlowLayoutStore,
      getProjectGpuFlowScene(projectState, {
        darkMode: useLocalStorage.getState().darkMode,
        revision: getProjectGpuSceneRevision(projectState),
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
  sectionImpl,
  worldRect,
}: {
  readonly sectionImpl: BaseSectionImplUnion;
  readonly worldRect: GpuRect;
}): readonly GpuPortAnchorDescriptor[] {
  if (!sectionImpl.isMinimized || !isBaseSectionWithParamsImpl(sectionImpl)) {
    return [];
  }

  const anchorY = worldRect.height / 2;
  return [
    ...(sectionImpl.edgeInputParams ?? []).map((paramId) => ({
      id: paramId,
      kind: "input" as const,
      localPosition: {
        x: -MINIMIZED_DATA_EDGE_HANDLE_EDGE_OFFSET_PX,
        y: anchorY,
      },
    })),
    ...(sectionImpl.edgeOutputPorts ?? []).map((port) => ({
      id: port.id,
      kind: "output" as const,
      localPosition: {
        x: worldRect.width + MINIMIZED_DATA_EDGE_HANDLE_EDGE_OFFSET_PX,
        y: anchorY,
      },
    })),
  ];
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
      kwargsControlsHeight: getProjectSceneMeasuredHeight(
        resizePolicyContext,
        getKwargsControlsHeightKey(sectionId),
      ),
      paramsFixedHeight: getProjectSceneMeasuredHeight(
        resizePolicyContext,
        getParamsFixedHeightKey(sectionId),
      ),
      sectionHeaderHeight: getProjectSceneMeasuredHeight(
        resizePolicyContext,
        getSectionHeaderHeightKey(sectionId),
      ),
      sectionSearchHeight: getProjectSceneMeasuredHeight(
        resizePolicyContext,
        getSectionSearchHeightKey(sectionId),
      ),
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

function getProjectGpuSceneResizePolicyContext(): ProjectGpuSceneResizePolicyContext {
  return {
    measuredHeightsByKey: useTemporaryMiscState.getState(),
    resizeEventBySectionId: useResizeEvent.getState().resizeEvent,
    sizingPolicy: useSettings.getState().sectionSizingPolicy,
  };
}

function getProjectSceneMeasuredHeight(
  resizePolicyContext: ProjectGpuSceneResizePolicyContext,
  key: string,
): number {
  const height = resizePolicyContext.measuredHeightsByKey[key];
  return typeof height === "number" ? height : 0;
}

function getProjectSectionSceneResizeDirections(
  enable: Exclude<ReturnType<typeof getResizableEnable>, false>,
): readonly GpuNodeResizeDirection[] {
  const directions: GpuNodeResizeDirection[] = [];
  if (enable.right) {
    directions.push("right");
  }
  if (enable.bottom) {
    directions.push("bottom");
  }
  if (enable.bottomRight) {
    directions.push("bottomRight");
  }
  return directions;
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

function getRenderableProjectChildSectionIds(
  projectState: ZustandProjectState,
  sectionId: string,
  sectionImpl: BaseSectionImplUnion,
): readonly string[] {
  if (!isBaseParentSectionImpl(sectionImpl)) {
    return [];
  }
  const childIds = (sectionImpl.children ?? []).filter((childId) =>
    getCurrEffectiveSectionImplIfPresent(projectState, childId),
  );
  const embeddedTerminal = getEmbeddedAttachedTerminalForCodeSection(
    projectState,
    sectionId,
    childIds,
  );
  if (!embeddedTerminal?.isTerminalMinimized) {
    return childIds;
  }
  return childIds.filter(
    (childId) => childId !== embeddedTerminal.attachedTerminalId,
  );
}

function shouldRenderProjectSceneSection(
  projectState: ZustandProjectState,
  sectionId: string,
): boolean {
  const { activeViewModeId, isEditingViewMode, viewModes } =
    projectState.projectConfig;
  if (!activeViewModeId) {
    return true;
  }
  const viewMode = viewModes[activeViewModeId];
  if (!viewMode) {
    return true;
  }
  const visibility = viewMode.visibilityBySectionId?.[sectionId];
  if (visibility === undefined) {
    return true;
  }
  return getSectionShouldRender(visibility, isEditingViewMode);
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

function createRectFromTopLevelLayoutNode(
  node: GpuFlowLayoutNode,
  sectionImpl: BaseSectionImplUnion,
  layout: ReturnType<typeof getActiveViewModeTopLevelSections>[string],
): GpuRect {
  return {
    height:
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

function resolveProjectSectionSceneDimension(
  value: unknown,
  fallback: number,
): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

function getProjectGpuSceneRevision(projectState: ZustandProjectState): number {
  return (
    Object.keys(projectState.sections).length +
    Object.keys(projectState.sectionImpls).length +
    Object.keys(projectState.sectionVariants).length +
    Object.keys(projectState.projectConfig.topLevelSections).length
  );
}
