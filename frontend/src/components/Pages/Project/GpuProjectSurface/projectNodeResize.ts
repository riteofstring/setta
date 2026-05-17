import type {
  GpuNodeResizeChange,
  GpuNodeResizePolicy,
  GpuNodeResizePolicyInput,
} from "gpuFlow/interactions/nodeResize";
import type {
  GpuFlowLayoutChangePhase,
  GpuFlowLayoutNode,
  GpuFlowLayoutStoreApi,
} from "gpuFlow/layoutStore";
import {
  getGpuFlowSceneDomSectionNodes,
  type GpuFlowScene,
  type GpuSectionSceneNode,
  type GpuSectionSceneResizePolicy,
} from "gpuFlow/scene";
import { resolveGpuSectionSceneResizePreviewSections } from "gpuFlow/sceneResize";
import { cancelViewportTransition } from "gpuFlow/viewportActions";
import type { GpuRect } from "gpuFlow/viewportMath";
import { gpuFlowViewportStore } from "gpuFlow/viewportStore";
import { useMemo, useRef, type MutableRefObject } from "react";
import { updateNodeDimensionsFromGpuResize } from "state/actions/nodeInternals";
import { getCurrEffectiveSectionImpl } from "state/actions/sectionInfos";
import {
  toTopLevelSectionInnerDimension,
  toTopLevelSectionOuterDimension,
} from "state/actions/sectionInfos/topLevelSectionNode";
import { debounced_route_set_top_level_section_layout } from "state/actions/sectionInfos/viewportUpdates";
import {
  clampChangedSize,
  getResizeHandleClickState,
  isResizeDoubleClick,
  resolveResizableGrid,
  resolveSectionResizeStopSize,
  SIZE_MODE,
} from "state/actions/sections/sectionResizePolicy";
import {
  applyLocalSectionSizeChange,
  persistSectionSizeChange,
} from "state/actions/sections/sectionSizePersistence";
import {
  getResizeStartAutoSizeUpdate,
  isHeightResizeDirection,
  type ResizeHandleDirection,
} from "state/actions/sections/sectionSizes";
import {
  useLocalStorage,
  useMisc,
  useProjectState,
  useResizeEvent,
  useSettings,
} from "state/definitions";
import { getSectionMinMaxDims } from "state/hooks/sectionSizes";
import type { SectionSize } from "utils/generatedTypes";
import type { ProjectFlowInteractionKeys } from "./projectGpuSurface";

type ProjectNodeResizeSession = {
  autoSizePromoted: boolean;
  doubleClickPending: boolean;
  resizeAttempted: boolean;
  resizeStarted: boolean;
  sectionId: string | null;
  startSectionSize: SectionSize | null;
  clickState: {
    lastTimestampMs: number | null;
    lastDirection: ResizeHandleDirection | null;
  };
};

type ProjectNodeResizeOptions = {
  readonly disabled: () => boolean;
  readonly getResizePolicy: (
    input: GpuNodeResizePolicyInput,
  ) => GpuNodeResizePolicy | false;
  readonly onNodeResize: (change: GpuNodeResizeChange) => void;
  readonly onNodeResizeCancel: (change: GpuNodeResizeChange) => void;
  readonly onNodeResizeStart: (change: GpuNodeResizeChange) => void;
  readonly onNodeResizeStop: (change: GpuNodeResizeChange) => void;
};

type ProjectNodeResizeOptionsInput = {
  canEditLayout: boolean;
  flowInteractionKeys: ProjectFlowInteractionKeys;
  isFollowTransitioning: boolean;
  layoutStore?: GpuFlowLayoutStoreApi | undefined;
  onResizePreviewSceneChange?:
    | ((scene: GpuFlowScene | null, phase: GpuFlowLayoutChangePhase) => void)
    | undefined;
  resolveResizePreviewScene?:
    | ((input: {
        readonly resizedWorldRect: GpuRect;
        readonly scene: GpuFlowScene;
        readonly sectionId: string;
      }) => GpuFlowScene)
    | undefined;
  scene?: GpuFlowScene | undefined;
};

type ProjectNodeResizeOptionsSourceAccessors = {
  readonly getLayoutStore: () => GpuFlowLayoutStoreApi | undefined;
  readonly getOnResizePreviewSceneChange: () =>
    | ProjectNodeResizeOptionsInput["onResizePreviewSceneChange"]
    | undefined;
  readonly getResolveResizePreviewScene: () =>
    | ProjectNodeResizeOptionsInput["resolveResizePreviewScene"]
    | undefined;
  readonly getScene: () => GpuFlowScene | undefined;
};

const EMPTY_PROJECT_NODE_RESIZE_SESSION: ProjectNodeResizeSession = {
  autoSizePromoted: false,
  clickState: {
    lastTimestampMs: null,
    lastDirection: null,
  },
  doubleClickPending: false,
  resizeAttempted: false,
  resizeStarted: false,
  sectionId: null,
  startSectionSize: null,
};

export function createProjectNodeResizeSession(): ProjectNodeResizeSession {
  return {
    ...EMPTY_PROJECT_NODE_RESIZE_SESSION,
    clickState: {
      ...EMPTY_PROJECT_NODE_RESIZE_SESSION.clickState,
    },
  };
}

export function useProjectNodeResizeOptions({
  canEditLayout,
  flowInteractionKeys,
  isFollowTransitioning,
  layoutStore,
  onResizePreviewSceneChange,
  resolveResizePreviewScene,
  scene,
}: ProjectNodeResizeOptionsInput) {
  const sessionRef = useRef<ProjectNodeResizeSession>(
    createProjectNodeResizeSession(),
  );
  const resizeSourcesRef = useRef<{
    layoutStore?: GpuFlowLayoutStoreApi | undefined;
    onResizePreviewSceneChange?:
      | ProjectNodeResizeOptionsInput["onResizePreviewSceneChange"]
      | undefined;
    resolveResizePreviewScene?:
      | ProjectNodeResizeOptionsInput["resolveResizePreviewScene"]
      | undefined;
    scene?: GpuFlowScene | undefined;
  }>({});
  resizeSourcesRef.current = {
    layoutStore,
    onResizePreviewSceneChange,
    resolveResizePreviewScene,
    scene,
  };
  const {
    panActivationKeyPressed,
    selectionKeyPressed,
    zoomActivationKeyPressed,
  } = flowInteractionKeys;
  return useMemo(
    () =>
      createProjectNodeResizeOptionsFromSources({
        canEditLayout,
        flowInteractionKeys: {
          panActivationKeyPressed,
          selectionKeyPressed,
          zoomActivationKeyPressed,
        },
        isFollowTransitioning,
        getLayoutStore: () => resizeSourcesRef.current.layoutStore,
        getOnResizePreviewSceneChange: () =>
          resizeSourcesRef.current.onResizePreviewSceneChange,
        getResolveResizePreviewScene: () =>
          resizeSourcesRef.current.resolveResizePreviewScene,
        getScene: () => resizeSourcesRef.current.scene,
        sessionRef,
      }),
    [
      canEditLayout,
      isFollowTransitioning,
      panActivationKeyPressed,
      selectionKeyPressed,
      zoomActivationKeyPressed,
    ],
  );
}

export function createProjectNodeResizeOptions({
  canEditLayout,
  flowInteractionKeys,
  isFollowTransitioning,
  layoutStore,
  onResizePreviewSceneChange,
  resolveResizePreviewScene,
  scene,
  sessionRef,
}: ProjectNodeResizeOptionsInput & {
  sessionRef: MutableRefObject<ProjectNodeResizeSession>;
}): ProjectNodeResizeOptions {
  return createProjectNodeResizeOptionsFromSources({
    canEditLayout,
    flowInteractionKeys,
    isFollowTransitioning,
    getLayoutStore: () => layoutStore,
    getOnResizePreviewSceneChange: () => onResizePreviewSceneChange,
    getResolveResizePreviewScene: () => resolveResizePreviewScene,
    getScene: () => scene,
    sessionRef,
  });
}

function createProjectNodeResizeOptionsFromSources({
  canEditLayout,
  flowInteractionKeys,
  getLayoutStore,
  getOnResizePreviewSceneChange,
  getResolveResizePreviewScene,
  getScene,
  isFollowTransitioning,
  sessionRef,
}: Omit<ProjectNodeResizeOptionsInput, "layoutStore" | "scene"> &
  ProjectNodeResizeOptionsSourceAccessors & {
    sessionRef: MutableRefObject<ProjectNodeResizeSession>;
  }): ProjectNodeResizeOptions {
  return {
    disabled: () =>
      isProjectGpuNodeResizeDisabled({
        flowInteractionKeys,
        isFollowTransitioning,
      }),
    getResizePolicy: (input: GpuNodeResizePolicyInput) =>
      getProjectNodeResizePolicy(input, { canEditLayout }),
    onNodeResize: (change: GpuNodeResizeChange) => {
      sessionRef.current.resizeAttempted = true;
      sessionRef.current.doubleClickPending = false;
      ensureProjectNodeHeightResizeStarted(change, sessionRef);
      patchProjectNodeResizeSceneLayout({
        change,
        layoutStore: getLayoutStore(),
        onResizePreviewSceneChange: getOnResizePreviewSceneChange(),
        phase: "change",
        resolveResizePreviewScene: getResolveResizePreviewScene(),
        scene: getScene(),
      });
    },
    onNodeResizeCancel: (change: GpuNodeResizeChange) => {
      cancelProjectNodeResize(change, sessionRef);
      restoreProjectNodeResizeSceneLayout({
        layoutStore: getLayoutStore(),
        onResizePreviewSceneChange: getOnResizePreviewSceneChange(),
        phase: "cancel",
        scene: getScene(),
      });
    },
    onNodeResizeStart: (change: GpuNodeResizeChange) => {
      startProjectNodeResize(change, sessionRef);
      patchProjectNodeResizeSceneLayout({
        change,
        layoutStore: getLayoutStore(),
        onResizePreviewSceneChange: getOnResizePreviewSceneChange(),
        phase: "start",
        resolveResizePreviewScene: getResolveResizePreviewScene(),
        scene: getScene(),
      });
    },
    onNodeResizeStop: (change: GpuNodeResizeChange) => {
      patchProjectNodeResizeSceneLayout({
        change,
        layoutStore: getLayoutStore(),
        onResizePreviewSceneChange: getOnResizePreviewSceneChange(),
        phase: "commit",
        resolveResizePreviewScene: getResolveResizePreviewScene(),
        scene: getScene(),
      });
      stopProjectNodeResize(change, sessionRef);
    },
  };
}

function patchProjectNodeResizeSceneLayout({
  change,
  layoutStore,
  onResizePreviewSceneChange,
  phase,
  resolveResizePreviewScene,
  scene,
}: {
  readonly change: GpuNodeResizeChange;
  readonly layoutStore?: GpuFlowLayoutStoreApi | undefined;
  readonly onResizePreviewSceneChange?:
    | ProjectNodeResizeOptionsInput["onResizePreviewSceneChange"]
    | undefined;
  readonly phase: GpuFlowLayoutChangePhase;
  readonly resolveResizePreviewScene?:
    | ProjectNodeResizeOptionsInput["resolveResizePreviewScene"]
    | undefined;
  readonly scene?: GpuFlowScene | undefined;
}): boolean {
  if (!layoutStore || !scene) {
    return false;
  }
  const resizedWorldRect = getProjectNodeResizeChangeRect(change);
  const previewScene = resolveResizePreviewScene
    ? resolveResizePreviewScene({
        resizedWorldRect,
        scene,
        sectionId: change.nodeId,
      })
    : {
        ...scene,
        sections: resolveGpuSectionSceneResizePreviewSections({
          resizedWorldRect,
          scene,
          sectionId: change.nodeId,
        }),
      };
  onResizePreviewSceneChange?.(previewScene, phase);
  return replaceProjectNodeResizeSceneLayoutStore({
    layoutStore,
    phase,
    sections: previewScene.sections,
  });
}

function restoreProjectNodeResizeSceneLayout({
  layoutStore,
  onResizePreviewSceneChange,
  phase,
  scene,
}: {
  readonly layoutStore?: GpuFlowLayoutStoreApi | undefined;
  readonly onResizePreviewSceneChange?:
    | ProjectNodeResizeOptionsInput["onResizePreviewSceneChange"]
    | undefined;
  readonly phase: GpuFlowLayoutChangePhase;
  readonly scene?: GpuFlowScene | undefined;
}): boolean {
  if (!layoutStore || !scene) {
    return false;
  }
  onResizePreviewSceneChange?.(null, phase);
  return replaceProjectNodeResizeSceneLayoutStore({
    layoutStore,
    phase,
    sections: scene.sections,
  });
}

function replaceProjectNodeResizeSceneLayoutStore({
  layoutStore,
  phase,
  sections,
}: {
  readonly layoutStore: GpuFlowLayoutStoreApi;
  readonly phase: GpuFlowLayoutChangePhase;
  readonly sections: readonly GpuSectionSceneNode[];
}): boolean {
  const state = layoutStore.getState();
  const currentNodeById = new Map(
    state.getNodes().map((node) => [node.nodeId, node]),
  );
  const nextNodes = getGpuFlowSceneDomSectionNodes({
    contentSurfaces: [],
    domIslands: [],
    edges: [],
    revision: 0,
    sections,
  }).map((node) =>
    preserveProjectNodeResizeLayoutNodeMetadata(
      node,
      currentNodeById.get(node.nodeId),
    ),
  );
  state.replaceNodes(nextNodes, {
    phase,
    reason: "resize",
  });
  return true;
}

function preserveProjectNodeResizeLayoutNodeMetadata(
  node: GpuFlowLayoutNode,
  currentNode: GpuFlowLayoutNode | undefined,
): GpuFlowLayoutNode {
  if (!currentNode) {
    return node;
  }
  return {
    ...node,
    ...(currentNode.interactionFlags !== undefined
      ? { interactionFlags: currentNode.interactionFlags }
      : {}),
    ...(currentNode.sourceElement !== undefined
      ? { sourceElement: currentNode.sourceElement }
      : {}),
    ...(currentNode.sourceLocalBounds !== undefined
      ? { sourceLocalBounds: currentNode.sourceLocalBounds }
      : {}),
    ...(currentNode.textureInvalidation !== undefined
      ? { textureInvalidation: currentNode.textureInvalidation }
      : {}),
  };
}

function getProjectNodeResizeChangeRect(change: GpuNodeResizeChange): GpuRect {
  return {
    height: getNumericProjectResizeDimension(
      change.layout.height,
      change.nodeId,
      "height",
    ),
    width: getNumericProjectResizeDimension(
      change.layout.width,
      change.nodeId,
      "width",
    ),
    x: change.layout.x,
    y: change.layout.y,
  };
}

export function getProjectNodeResizePolicy(
  input: GpuNodeResizePolicyInput,
  { canEditLayout }: { canEditLayout: boolean },
): GpuNodeResizePolicy | false {
  if (!canEditLayout) {
    return false;
  }
  const scenePolicy = getProjectNodeSceneResizePolicy(input.node, input.nodeId);
  const resizePolicy = getProjectNodeActiveResizePolicy(
    input.nodeId,
    input.direction,
    scenePolicy,
  );
  if (
    resizePolicy.locked ||
    !resizePolicy.directions.includes(input.direction)
  ) {
    return false;
  }
  const snapGrid = resolveResizableGrid({
    snapGrid: useSettings.getState().gui.snapGrid,
    snapToGrid: useLocalStorage.getState().snapToGrid,
  });
  return {
    aspectRatio: resizePolicy.aspectRatio,
    aspectRatioExtraHeight: resizePolicy.aspectRatioExtraHeight,
    aspectRatioExtraWidth: resizePolicy.aspectRatioExtraWidth,
    directions: resizePolicy.directions,
    enabled: true,
    maxHeight: resizePolicy.maxHeight,
    maxWidth: resizePolicy.maxWidth,
    minHeight: resizePolicy.minHeight,
    minWidth: resizePolicy.minWidth,
    ...(snapGrid ? { snapGrid, snapToGrid: true } : { snapToGrid: false }),
  };
}

function getProjectNodeActiveResizePolicy(
  sectionId: string,
  direction: GpuNodeResizePolicyInput["direction"],
  scenePolicy: GpuSectionSceneResizePolicy,
): GpuSectionSceneResizePolicy {
  if (!isHeightResizeDirection(direction as ResizeHandleDirection)) {
    return scenePolicy;
  }

  const resizeStartDimensions = getSectionMinMaxDims(sectionId, "start");
  return {
    ...scenePolicy,
    maxHeight: toTopLevelSectionOuterDimension(resizeStartDimensions.maxHeight),
    maxWidth: toTopLevelSectionOuterDimension(resizeStartDimensions.maxWidth),
    minHeight: toTopLevelSectionOuterDimension(resizeStartDimensions.minHeight),
    minWidth: toTopLevelSectionOuterDimension(resizeStartDimensions.minWidth),
  };
}

function getProjectNodeSceneResizePolicy(
  node: GpuNodeResizePolicyInput["node"],
  nodeId: string,
): GpuSectionSceneResizePolicy {
  const resizePolicy = (
    node as Partial<Pick<GpuSectionSceneNode, "resizePolicy">>
  ).resizePolicy;
  if (!resizePolicy) {
    throw new Error(
      `GPU resize for project section ${nodeId} requires scene resize policy.`,
    );
  }
  return resizePolicy;
}

function isProjectGpuNodeResizeDisabled({
  flowInteractionKeys,
  isFollowTransitioning,
}: {
  flowInteractionKeys: ProjectFlowInteractionKeys;
  isFollowTransitioning: boolean;
}): boolean {
  const viewportState = gpuFlowViewportStore.getState();
  return (
    flowInteractionKeys.panActivationKeyPressed ||
    flowInteractionKeys.zoomActivationKeyPressed ||
    isFollowTransitioning ||
    viewportState.moveSectionActivationKeyPressed ||
    (viewportState.selectionKeyPressed &&
      viewportState.userSelectionRect !== null) ||
    viewportState.multiSelectionActive
  );
}

function startProjectNodeResize(
  change: GpuNodeResizeChange,
  sessionRef: MutableRefObject<ProjectNodeResizeSession>,
) {
  cancelViewportTransition();
  useMisc.setState({ mouseDownDraggingSection: true });
  const direction = change.direction as ResizeHandleDirection;
  const { nextState, isDoubleClick } = getResizeHandleClickState({
    state: sessionRef.current.clickState,
    direction,
    timestampMs: Date.now(),
  });
  const impl = getCurrEffectiveSectionImpl(
    useProjectState.getState(),
    change.nodeId,
  );
  sessionRef.current = {
    autoSizePromoted: false,
    clickState: nextState,
    doubleClickPending: isDoubleClick,
    resizeAttempted: false,
    resizeStarted: false,
    sectionId: change.nodeId,
    startSectionSize: { ...impl.size },
  };
}

function ensureProjectNodeHeightResizeStarted(
  change: GpuNodeResizeChange,
  sessionRef: MutableRefObject<ProjectNodeResizeSession>,
) {
  const direction = change.direction as ResizeHandleDirection;
  if (
    sessionRef.current.sectionId !== change.nodeId ||
    sessionRef.current.resizeStarted ||
    !isHeightResizeDirection(direction)
  ) {
    return;
  }
  promoteProjectNodeAutoSize(change, sessionRef);
  sessionRef.current.resizeStarted = true;
  setProjectSectionResizeEvent(change.nodeId, "start");
}

function promoteProjectNodeAutoSize(
  change: GpuNodeResizeChange,
  sessionRef: MutableRefObject<ProjectNodeResizeSession>,
) {
  const impl = getCurrEffectiveSectionImpl(
    useProjectState.getState(),
    change.nodeId,
  );
  const startSize = getNumericProjectResizeSize(
    change.startLayout,
    change.nodeId,
  );
  const nextSize = getResizeStartAutoSizeUpdate({
    size: impl.size,
    direction: change.direction as ResizeHandleDirection,
    rect: toProjectSectionResizeSize(startSize),
  });
  if (!nextSize) {
    return;
  }
  sessionRef.current.autoSizePromoted = true;
  applyLocalSectionSizeChange(change.nodeId, nextSize);
}

function commitProjectNodeResizeLayout(change: GpuNodeResizeChange): boolean {
  const size = getNumericProjectResizeSize(change.layout, change.nodeId);
  return updateNodeDimensionsFromGpuResize({
    id: change.nodeId,
    height: size.height,
    width: size.width,
  });
}

function stopProjectNodeResize(
  change: GpuNodeResizeChange,
  sessionRef: MutableRefObject<ProjectNodeResizeSession>,
) {
  commitProjectNodeResizeLayout(change);
  const session = sessionRef.current;
  const isZeroDelta =
    change.totalSizeDelta.width === 0 && change.totalSizeDelta.height === 0;
  const isDoubleClick = isResizeDoubleClick({
    isPending: session.doubleClickPending,
    isZeroDelta,
    resizeAttempted: session.resizeAttempted,
  });
  if (!(isZeroDelta && !isDoubleClick && !session.resizeAttempted)) {
    const dimensions = getSectionMinMaxDims(change.nodeId);
    const impl = getCurrEffectiveSectionImpl(
      useProjectState.getState(),
      change.nodeId,
    );
    const finalSize = toProjectSectionResizeSize(
      getNumericProjectResizeSize(change.layout, change.nodeId),
    );
    const roundedFinalSize = {
      height: Math.round(finalSize.height),
      width: Math.round(finalSize.width),
    };
    const changedSize = resolveSectionResizeStopSize({
      direction: change.direction as ResizeHandleDirection,
      finalSize: roundedFinalSize,
      sizeMode: dimensions.sizeMode,
      aspectRatio: !impl.isMinimized && Boolean(impl.aspectRatio),
      isDoubleClick,
    });
    const persistenceSize = completeProjectNodeResizeStopSize({
      changedSize,
      finalSize: roundedFinalSize,
      isDoubleClick,
      sizeMode: dimensions.sizeMode,
      startSectionSize: session.startSectionSize,
    });
    const clampedSize = clampChangedSize({
      changedSize: persistenceSize,
      minHeight: dimensions.minHeight,
      minWidth: dimensions.minWidth,
      aspectRatio: !impl.isMinimized && Boolean(impl.aspectRatio),
    });
    persistSectionSizeChange(change.nodeId, clampedSize);
    debounced_route_set_top_level_section_layout();
  } else if (session.autoSizePromoted && session.startSectionSize) {
    applyLocalSectionSizeChange(change.nodeId, session.startSectionSize);
  }
  finishProjectNodeResize(change.nodeId, sessionRef);
}

function completeProjectNodeResizeStopSize({
  changedSize,
  finalSize,
  isDoubleClick,
  sizeMode,
  startSectionSize,
}: {
  changedSize: Partial<SectionSize>;
  finalSize: { height: number; width: number };
  isDoubleClick: boolean;
  sizeMode: { height: string; width: string };
  startSectionSize: SectionSize | null;
}): Partial<SectionSize> {
  if (isDoubleClick) {
    return changedSize;
  }

  const nextSize = { ...changedSize };
  if (
    canCompleteUnchangedResizeAxis({
      changedAxis: nextSize.width,
      currentAxis: nextSize.height,
      sizeMode: sizeMode.height,
      startAxis: startSectionSize?.height,
    })
  ) {
    nextSize.height = finalSize.height;
  }
  if (
    canCompleteUnchangedResizeAxis({
      changedAxis: nextSize.height,
      currentAxis: nextSize.width,
      sizeMode: sizeMode.width,
      startAxis: startSectionSize?.width,
    })
  ) {
    nextSize.width = finalSize.width;
  }
  return nextSize;
}

function canCompleteUnchangedResizeAxis({
  changedAxis,
  currentAxis,
  sizeMode,
  startAxis,
}: {
  changedAxis: SectionSize["height"] | undefined;
  currentAxis: SectionSize["height"] | undefined;
  sizeMode: string;
  startAxis: SectionSize["height"] | undefined;
}): boolean {
  if (changedAxis === undefined) {
    return false;
  }
  if (currentAxis !== undefined) {
    return false;
  }
  if (typeof startAxis !== "number") {
    return false;
  }
  return sizeMode !== SIZE_MODE.auto_only;
}

function cancelProjectNodeResize(
  change: GpuNodeResizeChange,
  sessionRef: MutableRefObject<ProjectNodeResizeSession>,
) {
  const startSize = getNumericProjectResizeSize(
    change.startLayout,
    change.nodeId,
  );
  updateNodeDimensionsFromGpuResize({
    id: change.nodeId,
    height: startSize.height,
    width: startSize.width,
  });
  const session = sessionRef.current;
  if (session.autoSizePromoted && session.startSectionSize) {
    applyLocalSectionSizeChange(change.nodeId, session.startSectionSize);
  }
  finishProjectNodeResize(change.nodeId, sessionRef);
}

function finishProjectNodeResize(
  sectionId: string,
  sessionRef: MutableRefObject<ProjectNodeResizeSession>,
) {
  if (sessionRef.current.resizeStarted) {
    setProjectSectionResizeEvent(sectionId, "end");
  }
  useMisc.setState({ mouseDownDraggingSection: false });
  sessionRef.current = {
    ...createProjectNodeResizeSession(),
    clickState: sessionRef.current.clickState,
  };
}

function setProjectSectionResizeEvent(
  sectionId: string,
  resizeEvent: "start" | "end",
) {
  useResizeEvent.setState((state) => {
    state.resizeEvent[sectionId] = resizeEvent;
  });
}

function getNumericProjectResizeSize(
  layout: Pick<GpuNodeResizeChange["layout"], "height" | "width">,
  sectionId: string,
): { height: number; width: number } {
  const height = getNumericProjectResizeDimension(
    layout.height,
    sectionId,
    "height",
  );
  const width = getNumericProjectResizeDimension(
    layout.width,
    sectionId,
    "width",
  );
  return {
    height,
    width,
  };
}

function getNumericProjectResizeDimension(
  value: number | null,
  sectionId: string,
  dimensionName: "height" | "width",
): number {
  if (typeof value !== "number") {
    throw new Error(
      `GPU resize for section ${sectionId} requires numeric ${dimensionName}.`,
    );
  }
  return value;
}

function toProjectSectionResizeSize({
  height,
  width,
}: {
  height: number;
  width: number;
}): { height: number; width: number } {
  return {
    height: toTopLevelSectionInnerDimension(height),
    width: toTopLevelSectionInnerDimension(width),
  };
}
