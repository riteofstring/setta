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
import {
  getGpuFlowSceneDomSectionNodes,
  type GpuContentSurface,
  type GpuFlowScene,
  type GpuSectionContentRendererDescriptor,
  type GpuSectionSceneLayoutMode,
  type GpuSectionSceneNode,
} from "gpuFlow/scene";
import type { GpuRect } from "gpuFlow/viewportMath";
import { useEffect, useMemo } from "react";
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
} from "state/actions/sectionInfos/topLevelSectionNode";
import {
  useLocalStorage,
  useProjectState,
  type ZustandProjectState,
} from "state/definitions";
import {
  isBaseParentSectionImpl,
  ListRootViewModeEnum,
  SectionTypeEnum,
  type BaseSectionImplUnion,
  type GroupSectionImpl,
  type ListRootSectionImpl,
} from "utils/generatedTypes";

export type ProjectGpuLayoutAdapter = {
  readonly layoutStore: GpuFlowLayoutStoreApi;
  readonly nodeLayouts: readonly GpuFlowLayoutNode[];
  readonly scene: GpuFlowScene;
};

let projectGpuLayoutStoreSyncSubscriberCount = 0;

const DEFAULT_NESTED_SECTION_WIDTH = 250;
const DEFAULT_NESTED_SECTION_HEIGHT = 150;
const NESTED_VERTICAL_SECTION_GAP_PX = 8;
const NESTED_HORIZONTAL_SECTION_GAP_PX = 8;
const NESTED_KANBAN_SECTION_GAP_PX = 12;
const NESTED_KANBAN_SECTION_WIDTH_PX = 288;
const SECTION_SCENE_MIN_SIZE_PX = 0;

export function useProjectGpuLayoutAdapter(): ProjectGpuLayoutAdapter {
  const layoutStore = useProjectGpuLayoutStore();
  const projectState = useProjectState((state) => state);
  const darkMode = useLocalStorage((state) => state.darkMode);
  const scene = useMemo(
    () =>
      getProjectGpuFlowScene(projectState, {
        darkMode,
        revision: getProjectGpuSceneRevision(projectState),
      }),
    [darkMode, projectState],
  );
  useProjectGpuLayoutStoreSceneSync(layoutStore, scene);
  const nodeLayouts =
    useGpuFlowLayoutStoreNodes(layoutStore) ?? EMPTY_GPU_FLOW_LAYOUT_NODES;
  return useMemo(
    () => ({ layoutStore, nodeLayouts, scene }),
    [layoutStore, nodeLayouts, scene],
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
    readonly revision?: number | undefined;
  },
): GpuFlowScene {
  const sections: GpuSectionSceneNode[] = [];
  const contentSurfaces: GpuContentSurface[] = [];
  const seenSectionIds = new Set<string>();
  const topLevelSections = getActiveViewModeTopLevelSections(projectState);
  const activeViewModeId = projectState.projectConfig.activeViewModeId;
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
      sectionImpl,
      sectionId,
      worldRect,
    });
    pushProjectSectionSceneNode({
      contentSurfaces,
      sceneNode,
      sections,
      seenSectionIds,
    });
    appendProjectChildSectionSceneNodes({
      contentSurfaces,
      parentNode: sceneNode,
      projectState,
      sections,
      seenSectionIds,
    });
  }

  return {
    contentSurfaces,
    domIslands: [],
    edges: [],
    revision: options.revision ?? 0,
    sections,
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
  contentSurfaces,
  parentNode,
  projectState,
  sections,
  seenSectionIds,
}: {
  readonly contentSurfaces: GpuContentSurface[];
  readonly parentNode: GpuSectionSceneNode;
  readonly projectState: ZustandProjectState;
  readonly sections: GpuSectionSceneNode[];
  readonly seenSectionIds: Set<string>;
}) {
  let previousChildRect: GpuRect | null = null;
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
    const localRect = createProjectNestedSectionLocalRect({
      layoutMode: parentNode.layoutMode,
      previousChildRect,
      sectionImpl: childImpl,
    });
    previousChildRect = localRect;
    const worldRect = translateRect(
      localRect,
      parentNode.childViewportRect ?? parentNode.bodyRect,
    );
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
        x: worldRect.x,
        y: worldRect.y,
        zIndex: parentNode.zIndex,
      },
      parentSectionId: parentNode.sectionId,
      sectionImpl: childImpl,
      sectionId: childSectionId,
      worldRect,
    });
    pushProjectSectionSceneNode({
      contentSurfaces,
      sceneNode: childNode,
      sections,
      seenSectionIds,
    });
    appendProjectChildSectionSceneNodes({
      contentSurfaces,
      parentNode: childNode,
      projectState,
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
  sectionId,
  sectionImpl,
  worldRect,
}: {
  readonly childSectionIds: readonly string[];
  readonly contentRenderer: GpuSectionContentRendererDescriptor;
  readonly localRect: GpuRect;
  readonly node: GpuFlowLayoutNode;
  readonly parentSectionId: string | null;
  readonly sectionId: string;
  readonly sectionImpl: BaseSectionImplUnion;
  readonly worldRect: GpuRect;
}): GpuSectionSceneNode {
  const bodyRect = worldRect;
  const childViewportRect = childSectionIds.length > 0 ? bodyRect : null;
  return {
    ...node,
    bodyRect,
    childSectionIds,
    childViewportRect,
    chromeRect: worldRect,
    clipRect: worldRect,
    contentRenderer,
    dirty: [],
    interactionLayer: "content",
    layoutMode: getProjectSectionSceneLayoutMode(sectionImpl),
    localRect,
    parentSectionId,
    portAnchors: [],
    resizePolicy: {
      locked: sectionImpl.positionAndSizeLocked,
      maxHeight: null,
      maxWidth: null,
      minHeight: SECTION_SCENE_MIN_SIZE_PX,
      minWidth: SECTION_SCENE_MIN_SIZE_PX,
    },
    scrollOffset: { x: 0, y: 0 },
    sectionId,
    worldRect,
  };
}

function pushProjectSectionSceneNode({
  contentSurfaces,
  sceneNode,
  sections,
  seenSectionIds,
}: {
  readonly contentSurfaces: GpuContentSurface[];
  readonly sceneNode: GpuSectionSceneNode;
  readonly sections: GpuSectionSceneNode[];
  readonly seenSectionIds: Set<string>;
}) {
  if (seenSectionIds.has(sceneNode.sectionId)) {
    throw new Error(`Duplicate section scene node ${sceneNode.sectionId}.`);
  }
  seenSectionIds.add(sceneNode.sectionId);
  sections.push(sceneNode);
  if (sceneNode.contentRenderer.kind === "scene-only") {
    return;
  }
  contentSurfaces.push({
    clipRect: sceneNode.clipRect,
    id: sceneNode.contentRenderer.surfaceId,
    ownerSectionId: sceneNode.sectionId,
    rect: sceneNode.worldRect,
    renderer: sceneNode.contentRenderer,
    zIndex: sceneNode.zIndex ?? 0,
  });
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

function createProjectNestedSectionLocalRect({
  layoutMode,
  previousChildRect,
  sectionImpl,
}: {
  readonly layoutMode: GpuSectionSceneLayoutMode;
  readonly previousChildRect: GpuRect | null;
  readonly sectionImpl: BaseSectionImplUnion;
}): GpuRect {
  const size = getProjectNestedSectionSceneSize(sectionImpl, layoutMode);
  if (!previousChildRect) {
    return { ...size, x: 0, y: 0 };
  }
  if (layoutMode === "horizontal" || layoutMode === "kanban") {
    return {
      ...size,
      x:
        previousChildRect.x +
        previousChildRect.width +
        getProjectNestedSectionGap(layoutMode),
      y: 0,
    };
  }
  return {
    ...size,
    x: 0,
    y:
      previousChildRect.y +
      previousChildRect.height +
      getProjectNestedSectionGap(layoutMode),
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

function translateRect(rect: GpuRect, origin: GpuRect): GpuRect {
  return {
    height: rect.height,
    width: rect.width,
    x: origin.x + rect.x,
    y: origin.y + rect.y,
  };
}

function getProjectGpuSceneRevision(projectState: ZustandProjectState): number {
  return (
    Object.keys(projectState.sections).length +
    Object.keys(projectState.sectionImpls).length +
    Object.keys(projectState.sectionVariants).length +
    Object.keys(projectState.projectConfig.topLevelSections).length
  );
}
