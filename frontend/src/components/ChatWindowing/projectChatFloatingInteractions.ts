import {
  buildFloatingSnapBounds,
  buildFloatingSnapResizeBounds,
  resolveFloatingSnapPresetFromBounds,
  type FloatingSnapPreset,
  type FloatingSnapResizeHandle,
  type FloatingWindowBoundaryInsets,
} from "components/ChatWindowing/projectChatSnapLayout";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { ChatWindowBounds } from "utils/generatedTypes";

export type FloatingWindowResizeDirection =
  | "left"
  | "right"
  | "top"
  | "bottom"
  | "top_left"
  | "top_right"
  | "bottom_left"
  | "bottom_right";

export type FloatingInteractionPill = {
  instanceId: string;
  bounds: ChatWindowBounds;
};

export type FloatingDragSession = {
  pointerId: number;
  instanceId: string;
  startX: number;
  startY: number;
  startBounds: ChatWindowBounds;
  dragBoundsStart: ChatWindowBounds;
  lastBounds: ChatWindowBounds;
  restoreBoundsOnUnsnap: ChatWindowBounds | null;
  hasActivatedUnsnap: boolean;
};

export type FloatingResizeSession = {
  pointerId: number;
  instanceId: string;
  direction: FloatingWindowResizeDirection;
  startX: number;
  startY: number;
  startBounds: ChatWindowBounds;
  lastBounds: ChatWindowBounds;
};

export type FloatingSnapPreview = {
  instanceId: string;
  preset: FloatingSnapPreset;
  bounds: ChatWindowBounds;
};

export type FloatingSnapResizeSession = {
  pointerId: number;
  axis: FloatingSnapResizeHandle["axis"];
  startPointerPosition: number;
  startCoordinate: number;
  minCoordinate: number;
  maxCoordinate: number;
  leadingInstanceIds: string[];
  trailingInstanceIds: string[];
  startBoundsByInstanceId: Record<string, ChatWindowBounds>;
  lastBoundsByInstanceId: Record<string, ChatWindowBounds>;
};

type UseProjectChatFloatingInteractionsArgs = {
  floatingWindowBoundaryInsets: FloatingWindowBoundaryInsets;
  floatingWindowIdsKey: string;
  openFloatingPills: FloatingInteractionPill[];
  onCommitBounds: (instanceId: string, bounds: ChatWindowBounds) => void;
  onCommitBoundsById: (boundsById: Record<string, ChatWindowBounds>) => void;
  onFocusWindow: (instanceId: string) => void;
  onRememberFloatingRestoreBounds: (
    instanceId: string,
    bounds: ChatWindowBounds,
  ) => void;
  clampFloatingBoundsForCurrentViewport: (
    bounds: ChatWindowBounds,
  ) => ChatWindowBounds;
  resolveFloatingRestoreBounds: (instanceId: string) => ChatWindowBounds;
  positionFloatingBoundsForUnsnap: (params: {
    currentBounds: ChatWindowBounds;
    restoreBounds: ChatWindowBounds;
    pointerX: number;
    pointerY: number;
  }) => ChatWindowBounds;
};

export const FLOATING_WINDOW_MIN_WIDTH_PX = 380;
export const FLOATING_WINDOW_MIN_HEIGHT_PX = 240;
export const FLOATING_WINDOW_TITLE_BAR_HEIGHT_PX = 32;
const FLOATING_WINDOW_MIN_VISIBLE_WIDTH_PX = 120;
const FLOATING_SNAP_EDGE_THRESHOLD_PX = 84;
const FLOATING_UNSNAP_DRAG_THRESHOLD_PX = 6;

function clampNumber(
  value: number,
  minValue: number,
  maxValue: number,
): number {
  if (value < minValue) {
    return minValue;
  }
  if (value > maxValue) {
    return maxValue;
  }
  return value;
}

function getViewportDimensions(): { width: number; height: number } | null {
  if (typeof window === "undefined") {
    return null;
  }
  const width = window.innerWidth;
  const height = window.innerHeight;
  if (width <= 0 || height <= 0) {
    return null;
  }
  return { width, height };
}

function resizeDirectionIncludesAxis(
  direction: FloatingWindowResizeDirection,
  axis: "left" | "right" | "top" | "bottom",
): boolean {
  return direction === axis || direction.includes(axis);
}

export function areFloatingBoundsEqual(
  a: ChatWindowBounds,
  b: ChatWindowBounds,
): boolean {
  return (
    a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
  );
}

export function clampFloatingBoundsToViewport(
  bounds: ChatWindowBounds,
  viewportWidthPx: number,
  viewportHeightPx: number,
  insets: FloatingWindowBoundaryInsets,
): ChatWindowBounds {
  const minXBoundary = Math.max(0, insets.left);
  const maxXBoundary = Math.max(
    minXBoundary + 1,
    viewportWidthPx - Math.max(0, insets.right),
  );
  const minYBoundary = Math.max(0, insets.top);
  const maxYBoundary = Math.max(
    minYBoundary + FLOATING_WINDOW_TITLE_BAR_HEIGHT_PX,
    viewportHeightPx - Math.max(0, insets.bottom),
  );
  const availableWidthPx = Math.max(1, maxXBoundary - minXBoundary);
  const availableHeightPx = Math.max(1, maxYBoundary - minYBoundary);

  const nextWidth = clampNumber(
    Math.max(FLOATING_WINDOW_MIN_WIDTH_PX, bounds.width),
    FLOATING_WINDOW_MIN_WIDTH_PX,
    Math.max(FLOATING_WINDOW_MIN_WIDTH_PX, availableWidthPx),
  );
  const nextHeight = clampNumber(
    Math.max(FLOATING_WINDOW_MIN_HEIGHT_PX, bounds.height),
    FLOATING_WINDOW_MIN_HEIGHT_PX,
    Math.max(FLOATING_WINDOW_MIN_HEIGHT_PX, availableHeightPx),
  );
  const minimumVisibleWidth = Math.max(
    1,
    Math.min(FLOATING_WINDOW_MIN_VISIBLE_WIDTH_PX, availableWidthPx),
  );

  const minX = minXBoundary + minimumVisibleWidth - nextWidth;
  const maxX = maxXBoundary - minimumVisibleWidth;
  const clampedX = clampNumber(
    bounds.x,
    Math.min(minX, maxX),
    Math.max(minX, maxX),
  );
  const clampedY = clampNumber(
    bounds.y,
    minYBoundary,
    Math.max(minYBoundary, maxYBoundary - FLOATING_WINDOW_TITLE_BAR_HEIGHT_PX),
  );

  return {
    x: clampedX,
    y: clampedY,
    width: nextWidth,
    height: nextHeight,
  };
}

export function resolveFloatingSnapPresetFromPointer(
  pointerX: number,
  pointerY: number,
  viewportWidthPx: number,
  viewportHeightPx: number,
  insets: FloatingWindowBoundaryInsets,
): FloatingSnapPreset | null {
  const minXBoundary = Math.max(0, insets.left);
  const maxXBoundary = Math.max(
    minXBoundary + 1,
    viewportWidthPx - Math.max(0, insets.right),
  );
  const minYBoundary = Math.max(0, insets.top);
  const maxYBoundary = Math.max(
    minYBoundary + 1,
    viewportHeightPx - Math.max(0, insets.bottom),
  );
  const nearLeft = pointerX <= minXBoundary + FLOATING_SNAP_EDGE_THRESHOLD_PX;
  const nearRight = pointerX >= maxXBoundary - FLOATING_SNAP_EDGE_THRESHOLD_PX;
  const nearTop = pointerY <= minYBoundary + FLOATING_SNAP_EDGE_THRESHOLD_PX;
  const nearBottom = pointerY >= maxYBoundary - FLOATING_SNAP_EDGE_THRESHOLD_PX;

  if (nearTop && nearLeft) {
    return "top_left";
  }
  if (nearTop && nearRight) {
    return "top_right";
  }
  if (nearBottom && nearLeft) {
    return "bottom_left";
  }
  if (nearBottom && nearRight) {
    return "bottom_right";
  }
  if (nearLeft) {
    return "left";
  }
  if (nearRight) {
    return "right";
  }
  if (nearTop) {
    return "top";
  }
  if (nearBottom) {
    return "bottom";
  }
  return null;
}

export function pruneFloatingPreviewBounds(
  previewBoundsById: Record<string, ChatWindowBounds>,
  allowedInstanceIds: Set<string>,
): Record<string, ChatWindowBounds> {
  let changed = false;
  const nextPreviewBoundsById: Record<string, ChatWindowBounds> = {};
  for (const [instanceId, bounds] of Object.entries(previewBoundsById)) {
    if (!allowedInstanceIds.has(instanceId)) {
      changed = true;
      continue;
    }
    nextPreviewBoundsById[instanceId] = bounds;
  }
  return changed ? nextPreviewBoundsById : previewBoundsById;
}

export function resolveFloatingDragPreview({
  activeDrag,
  pointerPosition,
  clampBounds,
  viewport,
  floatingWindowBoundaryInsets,
}: {
  activeDrag: FloatingDragSession;
  pointerPosition: { clientX: number; clientY: number };
  clampBounds: (bounds: ChatWindowBounds) => ChatWindowBounds;
  viewport: { width: number; height: number } | null;
  floatingWindowBoundaryInsets: FloatingWindowBoundaryInsets;
}): {
  hasActivatedUnsnap: boolean;
  nextBounds: ChatWindowBounds;
  nextSnapPreview: FloatingSnapPreview | null;
} {
  const deltaX = pointerPosition.clientX - activeDrag.startX;
  const deltaY = pointerPosition.clientY - activeDrag.startY;
  const dragDistance = Math.max(Math.abs(deltaX), Math.abs(deltaY));
  const hasActivatedUnsnap =
    activeDrag.restoreBoundsOnUnsnap &&
    !activeDrag.hasActivatedUnsnap &&
    dragDistance >= FLOATING_UNSNAP_DRAG_THRESHOLD_PX
      ? true
      : activeDrag.hasActivatedUnsnap;
  const dragBoundsStart = hasActivatedUnsnap
    ? activeDrag.dragBoundsStart
    : activeDrag.startBounds;
  const nextBounds = clampBounds({
    ...dragBoundsStart,
    x: dragBoundsStart.x + deltaX,
    y: dragBoundsStart.y + deltaY,
  });
  if (!viewport) {
    return {
      hasActivatedUnsnap,
      nextBounds,
      nextSnapPreview: null,
    };
  }
  const snapPreset = resolveFloatingSnapPresetFromPointer(
    pointerPosition.clientX,
    pointerPosition.clientY,
    viewport.width,
    viewport.height,
    floatingWindowBoundaryInsets,
  );
  return {
    hasActivatedUnsnap,
    nextBounds,
    nextSnapPreview: snapPreset
      ? {
          instanceId: activeDrag.instanceId,
          preset: snapPreset,
          bounds: buildFloatingSnapBounds(
            snapPreset,
            viewport.width,
            viewport.height,
            floatingWindowBoundaryInsets,
          ),
        }
      : null,
  };
}

export function resolveFloatingResizePreview({
  activeResize,
  pointerPosition,
  clampBounds,
}: {
  activeResize: FloatingResizeSession;
  pointerPosition: { clientX: number; clientY: number };
  clampBounds: (bounds: ChatWindowBounds) => ChatWindowBounds;
}): ChatWindowBounds {
  const deltaX = pointerPosition.clientX - activeResize.startX;
  const deltaY = pointerPosition.clientY - activeResize.startY;
  const resizingLeft = resizeDirectionIncludesAxis(
    activeResize.direction,
    "left",
  );
  const resizingRight = resizeDirectionIncludesAxis(
    activeResize.direction,
    "right",
  );
  const resizingTop = resizeDirectionIncludesAxis(
    activeResize.direction,
    "top",
  );
  const resizingBottom = resizeDirectionIncludesAxis(
    activeResize.direction,
    "bottom",
  );

  let nextWidth = activeResize.startBounds.width;
  let nextHeight = activeResize.startBounds.height;
  let nextX = activeResize.startBounds.x;
  let nextY = activeResize.startBounds.y;

  if (resizingLeft) {
    nextWidth = Math.max(
      FLOATING_WINDOW_MIN_WIDTH_PX,
      activeResize.startBounds.width - deltaX,
    );
    nextX =
      activeResize.startBounds.x + activeResize.startBounds.width - nextWidth;
  } else if (resizingRight) {
    nextWidth = Math.max(
      FLOATING_WINDOW_MIN_WIDTH_PX,
      activeResize.startBounds.width + deltaX,
    );
  }

  if (resizingTop) {
    nextHeight = Math.max(
      FLOATING_WINDOW_MIN_HEIGHT_PX,
      activeResize.startBounds.height - deltaY,
    );
    nextY =
      activeResize.startBounds.y + activeResize.startBounds.height - nextHeight;
  } else if (resizingBottom) {
    nextHeight = Math.max(
      FLOATING_WINDOW_MIN_HEIGHT_PX,
      activeResize.startBounds.height + deltaY,
    );
  }

  return clampBounds({
    x: nextX,
    y: nextY,
    width: nextWidth,
    height: nextHeight,
  });
}

export function resolveFloatingSnapResizeSession({
  pointerId,
  pointerPosition,
  handle,
  boundsByInstanceId,
}: {
  pointerId: number;
  pointerPosition: { clientX: number; clientY: number };
  handle: FloatingSnapResizeHandle;
  boundsByInstanceId: Record<string, ChatWindowBounds>;
}): FloatingSnapResizeSession | null {
  const involvedInstanceIds = [
    ...handle.leadingInstanceIds,
    ...handle.trailingInstanceIds,
  ];
  const startBoundsByInstanceId: Record<string, ChatWindowBounds> = {};
  for (const instanceId of involvedInstanceIds) {
    const bounds = boundsByInstanceId[instanceId];
    if (!bounds) {
      return null;
    }
    startBoundsByInstanceId[instanceId] = { ...bounds };
  }

  if (handle.axis === "vertical") {
    let minCoordinate = -Infinity;
    let maxCoordinate = Infinity;
    for (const instanceId of handle.leadingInstanceIds) {
      const bounds = startBoundsByInstanceId[instanceId];
      minCoordinate = Math.max(
        minCoordinate,
        bounds.x + FLOATING_WINDOW_MIN_WIDTH_PX,
      );
    }
    for (const instanceId of handle.trailingInstanceIds) {
      const bounds = startBoundsByInstanceId[instanceId];
      maxCoordinate = Math.min(
        maxCoordinate,
        bounds.x + bounds.width - FLOATING_WINDOW_MIN_WIDTH_PX,
      );
    }
    return {
      pointerId,
      axis: "vertical",
      startPointerPosition: pointerPosition.clientX,
      startCoordinate: handle.coordinate,
      minCoordinate,
      maxCoordinate,
      leadingInstanceIds: handle.leadingInstanceIds,
      trailingInstanceIds: handle.trailingInstanceIds,
      startBoundsByInstanceId,
      lastBoundsByInstanceId: startBoundsByInstanceId,
    };
  }

  let minCoordinate = -Infinity;
  let maxCoordinate = Infinity;
  for (const instanceId of handle.leadingInstanceIds) {
    const bounds = startBoundsByInstanceId[instanceId];
    minCoordinate = Math.max(
      minCoordinate,
      bounds.y + FLOATING_WINDOW_MIN_HEIGHT_PX,
    );
  }
  for (const instanceId of handle.trailingInstanceIds) {
    const bounds = startBoundsByInstanceId[instanceId];
    maxCoordinate = Math.min(
      maxCoordinate,
      bounds.y + bounds.height - FLOATING_WINDOW_MIN_HEIGHT_PX,
    );
  }
  return {
    pointerId,
    axis: "horizontal",
    startPointerPosition: pointerPosition.clientY,
    startCoordinate: handle.coordinate,
    minCoordinate,
    maxCoordinate,
    leadingInstanceIds: handle.leadingInstanceIds,
    trailingInstanceIds: handle.trailingInstanceIds,
    startBoundsByInstanceId,
    lastBoundsByInstanceId: startBoundsByInstanceId,
  };
}

export function resolveFloatingSnapResizePreview({
  activeResize,
  pointerPosition,
}: {
  activeResize: FloatingSnapResizeSession;
  pointerPosition: { clientX: number; clientY: number };
}): Record<string, ChatWindowBounds> {
  const nextPointerCoordinate =
    activeResize.axis === "vertical"
      ? pointerPosition.clientX
      : pointerPosition.clientY;
  const nextCoordinate = clampNumber(
    activeResize.startCoordinate +
      (nextPointerCoordinate - activeResize.startPointerPosition),
    activeResize.minCoordinate,
    activeResize.maxCoordinate,
  );
  return buildFloatingSnapResizeBounds(
    {
      axis: activeResize.axis,
      coordinate: activeResize.startCoordinate,
      leadingInstanceIds: activeResize.leadingInstanceIds,
      trailingInstanceIds: activeResize.trailingInstanceIds,
      startBoundsByInstanceId: activeResize.startBoundsByInstanceId,
    },
    nextCoordinate,
  );
}

function removeFloatingPreviewBounds(
  previewBoundsById: Record<string, ChatWindowBounds>,
  instanceId: string,
): Record<string, ChatWindowBounds> {
  if (!(instanceId in previewBoundsById)) {
    return previewBoundsById;
  }
  const nextPreviewBoundsById = { ...previewBoundsById };
  delete nextPreviewBoundsById[instanceId];
  return nextPreviewBoundsById;
}

function removeFloatingPreviewBoundsBatch(
  previewBoundsById: Record<string, ChatWindowBounds>,
  instanceIds: string[],
): Record<string, ChatWindowBounds> {
  let nextPreviewBoundsById = previewBoundsById;
  for (const instanceId of instanceIds) {
    if (!(instanceId in nextPreviewBoundsById)) {
      continue;
    }
    if (nextPreviewBoundsById === previewBoundsById) {
      nextPreviewBoundsById = { ...previewBoundsById };
    }
    delete nextPreviewBoundsById[instanceId];
  }
  return nextPreviewBoundsById;
}

export function useProjectChatFloatingInteractions({
  floatingWindowBoundaryInsets,
  floatingWindowIdsKey,
  openFloatingPills,
  onCommitBounds,
  onCommitBoundsById,
  onFocusWindow,
  onRememberFloatingRestoreBounds,
  clampFloatingBoundsForCurrentViewport,
  resolveFloatingRestoreBounds,
  positionFloatingBoundsForUnsnap,
}: UseProjectChatFloatingInteractionsArgs): {
  floatingPreviewBoundsById: Record<string, ChatWindowBounds>;
  activeFloatingSnapPreview: FloatingSnapPreview | null;
  handleFloatingDragPointerDown: (
    event: ReactPointerEvent<HTMLButtonElement>,
    pill: FloatingInteractionPill,
  ) => void;
  handleFloatingDragPointerMove: (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void;
  handleFloatingDragPointerUp: (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void;
  handleFloatingResizePointerDown: (
    event: ReactPointerEvent<HTMLDivElement>,
    pill: FloatingInteractionPill,
    direction: FloatingWindowResizeDirection,
  ) => void;
  handleFloatingResizePointerMove: (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => void;
  handleFloatingResizePointerUp: (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => void;
  handleFloatingSnapResizePointerDown: (
    event: ReactPointerEvent<HTMLDivElement>,
    handle: FloatingSnapResizeHandle,
  ) => void;
  handleFloatingSnapResizePointerMove: (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => void;
  handleFloatingSnapResizePointerUp: (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => void;
} {
  const [floatingPreviewBoundsById, setFloatingPreviewBoundsById] = useState<
    Record<string, ChatWindowBounds>
  >({});
  const [activeFloatingSnapPreview, setActiveFloatingSnapPreview] =
    useState<FloatingSnapPreview | null>(null);
  const activeFloatingDragRef = useRef<FloatingDragSession | null>(null);
  const activeFloatingResizeRef = useRef<FloatingResizeSession | null>(null);
  const activeFloatingSnapResizeRef = useRef<FloatingSnapResizeSession | null>(
    null,
  );
  const activeFloatingSnapPreviewRef = useRef<FloatingSnapPreview | null>(null);
  const floatingPreviewBoundsRef = useRef<Record<string, ChatWindowBounds>>({});
  const queuedFloatingPreviewBoundsRef = useRef<Record<
    string,
    ChatWindowBounds
  > | null>(null);
  const floatingPreviewAnimationFrameRef = useRef<number | null>(null);
  const openFloatingPillsById = useMemo(
    () =>
      Object.fromEntries(
        openFloatingPills.map((pill) => [pill.instanceId, pill]),
      ),
    [openFloatingPills],
  );

  useEffect(() => {
    floatingPreviewBoundsRef.current = floatingPreviewBoundsById;
  }, [floatingPreviewBoundsById]);

  useEffect(() => {
    return () => {
      if (floatingPreviewAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(floatingPreviewAnimationFrameRef.current);
      }
      floatingPreviewAnimationFrameRef.current = null;
      queuedFloatingPreviewBoundsRef.current = null;
    };
  }, []);

  useEffect(() => {
    activeFloatingDragRef.current = null;
    activeFloatingResizeRef.current = null;
    activeFloatingSnapResizeRef.current = null;
    activeFloatingSnapPreviewRef.current = null;
    setActiveFloatingSnapPreview(null);
    const allowedIds = new Set(
      floatingWindowIdsKey
        .split("|")
        .map((instanceId) => instanceId.trim())
        .filter((instanceId) => instanceId.length > 0),
    );
    setFloatingPreviewBoundsById((current) => {
      const nextPreviewBoundsById =
        allowedIds.size === 0
          ? Object.keys(current).length === 0
            ? current
            : {}
          : pruneFloatingPreviewBounds(current, allowedIds);
      floatingPreviewBoundsRef.current = nextPreviewBoundsById;
      queuedFloatingPreviewBoundsRef.current = nextPreviewBoundsById;
      return nextPreviewBoundsById;
    });
  }, [floatingWindowIdsKey]);

  const commitQueuedFloatingPreviewBounds = useCallback(() => {
    floatingPreviewAnimationFrameRef.current = null;
    const nextBoundsById = queuedFloatingPreviewBoundsRef.current;
    queuedFloatingPreviewBoundsRef.current = null;
    if (!nextBoundsById) {
      return;
    }
    floatingPreviewBoundsRef.current = nextBoundsById;
    setFloatingPreviewBoundsById((current) =>
      current === nextBoundsById ? current : nextBoundsById,
    );
  }, []);

  const scheduleFloatingPreviewBoundsCommit = useCallback(() => {
    if (floatingPreviewAnimationFrameRef.current !== null) {
      return;
    }
    floatingPreviewAnimationFrameRef.current = window.requestAnimationFrame(
      commitQueuedFloatingPreviewBounds,
    );
  }, [commitQueuedFloatingPreviewBounds]);

  const setFloatingPreviewBoundsImmediately = useCallback(
    (nextBoundsById: Record<string, ChatWindowBounds>) => {
      if (floatingPreviewAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(floatingPreviewAnimationFrameRef.current);
      }
      floatingPreviewAnimationFrameRef.current = null;
      queuedFloatingPreviewBoundsRef.current = null;
      floatingPreviewBoundsRef.current = nextBoundsById;
      setFloatingPreviewBoundsById((current) =>
        current === nextBoundsById ? current : nextBoundsById,
      );
    },
    [],
  );

  const handleFloatingBoundsPreview = useCallback(
    (instanceId: string, bounds: ChatWindowBounds) => {
      const current =
        queuedFloatingPreviewBoundsRef.current ??
        floatingPreviewBoundsRef.current;
      const existing = current[instanceId];
      if (existing && areFloatingBoundsEqual(existing, bounds)) {
        return;
      }
      const nextBoundsById = {
        ...current,
        [instanceId]: bounds,
      };
      queuedFloatingPreviewBoundsRef.current = nextBoundsById;
      floatingPreviewBoundsRef.current = nextBoundsById;
      scheduleFloatingPreviewBoundsCommit();
    },
    [scheduleFloatingPreviewBoundsCommit],
  );

  const handleFloatingBoundsPreviewBatch = useCallback(
    (boundsByInstanceId: Record<string, ChatWindowBounds>) => {
      const current =
        queuedFloatingPreviewBoundsRef.current ??
        floatingPreviewBoundsRef.current;
      let nextBoundsById = current;
      for (const [instanceId, bounds] of Object.entries(boundsByInstanceId)) {
        const existing = nextBoundsById[instanceId];
        if (existing && areFloatingBoundsEqual(existing, bounds)) {
          continue;
        }
        if (nextBoundsById === current) {
          nextBoundsById = { ...current };
        }
        nextBoundsById[instanceId] = bounds;
      }
      if (nextBoundsById === current) {
        return;
      }
      queuedFloatingPreviewBoundsRef.current = nextBoundsById;
      floatingPreviewBoundsRef.current = nextBoundsById;
      scheduleFloatingPreviewBoundsCommit();
    },
    [scheduleFloatingPreviewBoundsCommit],
  );

  const clearFloatingBoundsPreview = useCallback(
    (instanceId: string) => {
      const current =
        queuedFloatingPreviewBoundsRef.current ??
        floatingPreviewBoundsRef.current;
      const nextBoundsById = removeFloatingPreviewBounds(current, instanceId);
      if (nextBoundsById === current) {
        return;
      }
      setFloatingPreviewBoundsImmediately(nextBoundsById);
    },
    [setFloatingPreviewBoundsImmediately],
  );

  const clearFloatingBoundsPreviewBatch = useCallback(
    (instanceIds: string[]) => {
      const current =
        queuedFloatingPreviewBoundsRef.current ??
        floatingPreviewBoundsRef.current;
      const nextBoundsById = removeFloatingPreviewBoundsBatch(
        current,
        instanceIds,
      );
      if (nextBoundsById === current) {
        return;
      }
      setFloatingPreviewBoundsImmediately(nextBoundsById);
    },
    [setFloatingPreviewBoundsImmediately],
  );

  const updateActiveFloatingSnapPreview = useCallback(
    (nextSnapPreview: FloatingSnapPreview | null) => {
      activeFloatingSnapPreviewRef.current = nextSnapPreview;
      setActiveFloatingSnapPreview((current) => {
        if (!current && !nextSnapPreview) {
          return current;
        }
        if (current && nextSnapPreview) {
          const sameBounds = areFloatingBoundsEqual(
            current.bounds,
            nextSnapPreview.bounds,
          );
          if (
            current.instanceId === nextSnapPreview.instanceId &&
            current.preset === nextSnapPreview.preset &&
            sameBounds
          ) {
            return current;
          }
        }
        return nextSnapPreview;
      });
    },
    [],
  );

  useEffect(() => {
    if (openFloatingPills.length === 0) {
      return;
    }

    const applyViewportGuardrails = () => {
      if (
        activeFloatingDragRef.current ||
        activeFloatingResizeRef.current ||
        activeFloatingSnapResizeRef.current
      ) {
        return;
      }
      const viewport = getViewportDimensions();
      if (!viewport) {
        return;
      }

      for (const pill of openFloatingPills) {
        const clampedBounds = clampFloatingBoundsToViewport(
          pill.bounds,
          viewport.width,
          viewport.height,
          floatingWindowBoundaryInsets,
        );
        if (areFloatingBoundsEqual(pill.bounds, clampedBounds)) {
          continue;
        }
        onCommitBounds(pill.instanceId, clampedBounds);
      }
    };

    applyViewportGuardrails();

    let frameRequestId: number | null = null;
    const onResize = () => {
      if (frameRequestId !== null) {
        window.cancelAnimationFrame(frameRequestId);
      }
      frameRequestId = window.requestAnimationFrame(() => {
        frameRequestId = null;
        applyViewportGuardrails();
      });
    };
    window.addEventListener("resize", onResize);
    return () => {
      if (frameRequestId !== null) {
        window.cancelAnimationFrame(frameRequestId);
      }
      window.removeEventListener("resize", onResize);
    };
  }, [floatingWindowBoundaryInsets, onCommitBounds, openFloatingPills]);

  const handleFloatingDragPointerDown = useCallback(
    (
      event: ReactPointerEvent<HTMLButtonElement>,
      pill: FloatingInteractionPill,
    ) => {
      if (event.button !== 0) {
        return;
      }
      if (
        event.detail > 1 &&
        event.target instanceof HTMLElement &&
        event.target.closest("[data-project-chat-window-title='true']")
      ) {
        return;
      }
      const previewBounds = floatingPreviewBoundsRef.current[pill.instanceId];
      const currentBounds = clampFloatingBoundsForCurrentViewport(
        previewBounds ?? pill.bounds,
      );
      const viewport = getViewportDimensions();
      const snapPreset = viewport
        ? resolveFloatingSnapPresetFromBounds(
            currentBounds,
            viewport.width,
            viewport.height,
            floatingWindowBoundaryInsets,
          )
        : null;
      const restoreBoundsOnUnsnap = snapPreset
        ? resolveFloatingRestoreBounds(pill.instanceId)
        : null;
      if (restoreBoundsOnUnsnap) {
        onRememberFloatingRestoreBounds(pill.instanceId, restoreBoundsOnUnsnap);
      }
      const dragBoundsStart = restoreBoundsOnUnsnap
        ? positionFloatingBoundsForUnsnap({
            currentBounds,
            restoreBounds: restoreBoundsOnUnsnap,
            pointerX: event.clientX,
            pointerY: event.clientY,
          })
        : currentBounds;
      const clonedCurrentBounds = { ...currentBounds };
      activeFloatingDragRef.current = {
        pointerId: event.pointerId,
        instanceId: pill.instanceId,
        startX: event.clientX,
        startY: event.clientY,
        startBounds: clonedCurrentBounds,
        dragBoundsStart: { ...dragBoundsStart },
        lastBounds: clonedCurrentBounds,
        restoreBoundsOnUnsnap,
        hasActivatedUnsnap: restoreBoundsOnUnsnap === null,
      };
      updateActiveFloatingSnapPreview(null);
      onFocusWindow(pill.instanceId);
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [
      clampFloatingBoundsForCurrentViewport,
      floatingWindowBoundaryInsets,
      onFocusWindow,
      onRememberFloatingRestoreBounds,
      positionFloatingBoundsForUnsnap,
      resolveFloatingRestoreBounds,
      updateActiveFloatingSnapPreview,
    ],
  );

  const handleFloatingDragPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      const activeDrag = activeFloatingDragRef.current;
      if (!activeDrag || activeDrag.pointerId !== event.pointerId) {
        return;
      }
      const nextPreview = resolveFloatingDragPreview({
        activeDrag,
        pointerPosition: {
          clientX: event.clientX,
          clientY: event.clientY,
        },
        clampBounds: clampFloatingBoundsForCurrentViewport,
        viewport: getViewportDimensions(),
        floatingWindowBoundaryInsets,
      });
      activeDrag.hasActivatedUnsnap = nextPreview.hasActivatedUnsnap;
      activeDrag.lastBounds = nextPreview.nextBounds;
      updateActiveFloatingSnapPreview(nextPreview.nextSnapPreview);
      if (nextPreview.hasActivatedUnsnap) {
        handleFloatingBoundsPreview(
          activeDrag.instanceId,
          nextPreview.nextBounds,
        );
      }
    },
    [
      clampFloatingBoundsForCurrentViewport,
      floatingWindowBoundaryInsets,
      handleFloatingBoundsPreview,
      updateActiveFloatingSnapPreview,
    ],
  );

  const handleFloatingDragPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      const activeDrag = activeFloatingDragRef.current;
      if (!activeDrag || activeDrag.pointerId !== event.pointerId) {
        return;
      }
      const activeSnap = activeFloatingSnapPreviewRef.current;
      if (activeSnap && activeSnap.instanceId === activeDrag.instanceId) {
        onCommitBounds(activeDrag.instanceId, activeSnap.bounds);
      } else if (!activeDrag.hasActivatedUnsnap) {
        onCommitBounds(activeDrag.instanceId, activeDrag.startBounds);
      } else {
        onCommitBounds(activeDrag.instanceId, activeDrag.lastBounds);
      }
      clearFloatingBoundsPreview(activeDrag.instanceId);
      updateActiveFloatingSnapPreview(null);
      activeFloatingDragRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    [
      clearFloatingBoundsPreview,
      onCommitBounds,
      updateActiveFloatingSnapPreview,
    ],
  );

  const handleFloatingResizePointerDown = useCallback(
    (
      event: ReactPointerEvent<HTMLDivElement>,
      pill: FloatingInteractionPill,
      direction: FloatingWindowResizeDirection,
    ) => {
      if (event.button !== 0) {
        return;
      }
      const previewBounds = floatingPreviewBoundsRef.current[pill.instanceId];
      const startBounds = clampFloatingBoundsForCurrentViewport(
        previewBounds ?? pill.bounds,
      );
      const clonedBounds = { ...startBounds };
      activeFloatingResizeRef.current = {
        pointerId: event.pointerId,
        instanceId: pill.instanceId,
        direction,
        startX: event.clientX,
        startY: event.clientY,
        startBounds: clonedBounds,
        lastBounds: clonedBounds,
      };
      updateActiveFloatingSnapPreview(null);
      onFocusWindow(pill.instanceId);
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [
      clampFloatingBoundsForCurrentViewport,
      onFocusWindow,
      updateActiveFloatingSnapPreview,
    ],
  );

  const handleFloatingResizePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const activeResize = activeFloatingResizeRef.current;
      if (!activeResize || activeResize.pointerId !== event.pointerId) {
        return;
      }
      const nextBounds = resolveFloatingResizePreview({
        activeResize,
        pointerPosition: {
          clientX: event.clientX,
          clientY: event.clientY,
        },
        clampBounds: clampFloatingBoundsForCurrentViewport,
      });
      activeResize.lastBounds = nextBounds;
      handleFloatingBoundsPreview(activeResize.instanceId, nextBounds);
    },
    [clampFloatingBoundsForCurrentViewport, handleFloatingBoundsPreview],
  );

  const handleFloatingResizePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const activeResize = activeFloatingResizeRef.current;
      if (!activeResize || activeResize.pointerId !== event.pointerId) {
        return;
      }
      onCommitBounds(activeResize.instanceId, activeResize.lastBounds);
      clearFloatingBoundsPreview(activeResize.instanceId);
      updateActiveFloatingSnapPreview(null);
      activeFloatingResizeRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    [
      clearFloatingBoundsPreview,
      onCommitBounds,
      updateActiveFloatingSnapPreview,
    ],
  );

  const handleFloatingSnapResizePointerDown = useCallback(
    (
      event: ReactPointerEvent<HTMLDivElement>,
      handle: FloatingSnapResizeHandle,
    ) => {
      if (event.button !== 0) {
        return;
      }
      const boundsByInstanceId = Object.fromEntries(
        [...handle.leadingInstanceIds, ...handle.trailingInstanceIds]
          .map((instanceId) => {
            const pill = openFloatingPillsById[instanceId];
            const previewBounds = floatingPreviewBoundsRef.current[instanceId];
            if (!pill) {
              return null;
            }
            return [instanceId, previewBounds ?? pill.bounds];
          })
          .filter(
            (entry): entry is [string, ChatWindowBounds] => entry !== null,
          ),
      );
      const activeResize = resolveFloatingSnapResizeSession({
        pointerId: event.pointerId,
        pointerPosition: {
          clientX: event.clientX,
          clientY: event.clientY,
        },
        handle,
        boundsByInstanceId,
      });
      if (!activeResize) {
        return;
      }
      activeFloatingSnapResizeRef.current = activeResize;
      updateActiveFloatingSnapPreview(null);
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [openFloatingPillsById, updateActiveFloatingSnapPreview],
  );

  const handleFloatingSnapResizePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const activeResize = activeFloatingSnapResizeRef.current;
      if (!activeResize || activeResize.pointerId !== event.pointerId) {
        return;
      }
      const nextBoundsByInstanceId = resolveFloatingSnapResizePreview({
        activeResize,
        pointerPosition: {
          clientX: event.clientX,
          clientY: event.clientY,
        },
      });
      activeResize.lastBoundsByInstanceId = nextBoundsByInstanceId;
      handleFloatingBoundsPreviewBatch(nextBoundsByInstanceId);
    },
    [handleFloatingBoundsPreviewBatch],
  );

  const handleFloatingSnapResizePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const activeResize = activeFloatingSnapResizeRef.current;
      if (!activeResize || activeResize.pointerId !== event.pointerId) {
        return;
      }
      onCommitBoundsById(activeResize.lastBoundsByInstanceId);
      clearFloatingBoundsPreviewBatch([
        ...activeResize.leadingInstanceIds,
        ...activeResize.trailingInstanceIds,
      ]);
      updateActiveFloatingSnapPreview(null);
      activeFloatingSnapResizeRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    [
      clearFloatingBoundsPreviewBatch,
      onCommitBoundsById,
      updateActiveFloatingSnapPreview,
    ],
  );

  return {
    floatingPreviewBoundsById,
    activeFloatingSnapPreview,
    handleFloatingDragPointerDown,
    handleFloatingDragPointerMove,
    handleFloatingDragPointerUp,
    handleFloatingResizePointerDown,
    handleFloatingResizePointerMove,
    handleFloatingResizePointerUp,
    handleFloatingSnapResizePointerDown,
    handleFloatingSnapResizePointerMove,
    handleFloatingSnapResizePointerUp,
  };
}
