import { useDndState } from "forks/dnd-kit/dndState";
import type {
  GpuNodeResizeChange,
  GpuNodeResizePolicy,
  GpuNodeResizePolicyInput,
} from "gpuFlow/interactions/nodeResize";
import { cancelViewportTransition } from "gpuFlow/viewportActions";
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
  getResizableEnable,
  getResizeAxisAvailability,
  getResizeHandleClickState,
  isResizeDoubleClick,
  resolveResizableGrid,
  resolveSectionResizeStopSize,
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

export type ProjectNodeResizeSession = {
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

type ProjectNodeResizeOptionsInput = {
  canEditLayout: boolean;
  flowInteractionKeys: ProjectFlowInteractionKeys;
  isFollowTransitioning: boolean;
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
}: ProjectNodeResizeOptionsInput) {
  const sessionRef = useRef<ProjectNodeResizeSession>(
    createProjectNodeResizeSession(),
  );
  return useMemo(
    () =>
      createProjectNodeResizeOptions({
        canEditLayout,
        flowInteractionKeys,
        isFollowTransitioning,
        sessionRef,
      }),
    [canEditLayout, flowInteractionKeys, isFollowTransitioning],
  );
}

export function createProjectNodeResizeOptions({
  canEditLayout,
  flowInteractionKeys,
  isFollowTransitioning,
  sessionRef,
}: ProjectNodeResizeOptionsInput & {
  sessionRef: MutableRefObject<ProjectNodeResizeSession>;
}) {
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
      applyProjectNodeResizeLayout(change);
    },
    onNodeResizeCancel: (change: GpuNodeResizeChange) => {
      cancelProjectNodeResize(change, sessionRef);
    },
    onNodeResizeStart: (change: GpuNodeResizeChange) => {
      startProjectNodeResize(change, sessionRef);
    },
    onNodeResizeStop: (change: GpuNodeResizeChange) => {
      stopProjectNodeResize(change, sessionRef);
    },
  };
}

export function getProjectNodeResizePolicy(
  input: GpuNodeResizePolicyInput,
  { canEditLayout }: { canEditLayout: boolean },
): GpuNodeResizePolicy | false {
  if (!canEditLayout) {
    return false;
  }
  const projectState = useProjectState.getState();
  const impl = getCurrEffectiveSectionImpl(projectState, input.nodeId);
  const dimensions = getSectionMinMaxDims(input.nodeId);
  const { heightResizable, widthResizable } = getResizeAxisAvailability({
    maxHeight: dimensions.maxHeight,
    maxWidth: dimensions.maxWidth,
    minHeight: dimensions.minHeight,
    minWidth: dimensions.minWidth,
    sizeMode: dimensions.sizeMode,
  });
  const enable = getResizableEnable({
    disablePointerEvents: false,
    positionAndSizeLocked: impl.positionAndSizeLocked,
    heightResizable,
    widthResizable,
  });
  if (!enable) {
    return false;
  }
  const directions = getEnabledResizeDirections(enable);
  if (!directions.includes(input.direction)) {
    return false;
  }
  const snapGrid = resolveResizableGrid({
    snapGrid: useSettings.getState().gui.snapGrid,
    snapToGrid: useLocalStorage.getState().snapToGrid,
  });
  return {
    aspectRatio: !impl.isMinimized && Boolean(impl.aspectRatio),
    aspectRatioExtraHeight: impl.aspectRatioExtraHeight ?? 0,
    aspectRatioExtraWidth: impl.aspectRatioExtraWidth ?? 0,
    directions,
    enabled: true,
    maxHeight: toTopLevelSectionOuterDimension(dimensions.maxHeight),
    maxWidth: toTopLevelSectionOuterDimension(dimensions.maxWidth),
    minHeight: toTopLevelSectionOuterDimension(dimensions.minHeight),
    minWidth: toTopLevelSectionOuterDimension(dimensions.minWidth),
    ...(snapGrid ? { snapGrid, snapToGrid: true } : { snapToGrid: false }),
  };
}

function getEnabledResizeDirections(
  enable: Exclude<ReturnType<typeof getResizableEnable>, false>,
) {
  const directions: Array<"right" | "bottom" | "bottomRight"> = [];
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

function isProjectGpuNodeResizeDisabled({
  flowInteractionKeys,
  isFollowTransitioning,
}: {
  flowInteractionKeys: ProjectFlowInteractionKeys;
  isFollowTransitioning: boolean;
}): boolean {
  const dndState = useDndState.getState();
  const viewportState = gpuFlowViewportStore.getState();
  return (
    flowInteractionKeys.panActivationKeyPressed ||
    flowInteractionKeys.zoomActivationKeyPressed ||
    isFollowTransitioning ||
    dndState.isSorting ||
    dndState.isMovingFree ||
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
  promoteProjectNodeAutoSize(change, sessionRef);
  if (isHeightResizeDirection(direction)) {
    sessionRef.current.resizeStarted = true;
    setProjectSectionResizeEvent(change.nodeId, "start");
  }
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

function applyProjectNodeResizeLayout(change: GpuNodeResizeChange): boolean {
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
  applyProjectNodeResizeLayout(change);
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
    const changedSize = resolveSectionResizeStopSize({
      direction: change.direction as ResizeHandleDirection,
      finalSize: {
        height: Math.round(finalSize.height),
        width: Math.round(finalSize.width),
      },
      sizeMode: dimensions.sizeMode,
      aspectRatio: !impl.isMinimized && Boolean(impl.aspectRatio),
      isDoubleClick,
    });
    const clampedSize = clampChangedSize({
      changedSize,
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
  if (typeof layout.height !== "number" || typeof layout.width !== "number") {
    throw new Error(
      `GPU resize for section ${sectionId} requires numeric width and height.`,
    );
  }
  return {
    height: layout.height,
    width: layout.width,
  };
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
