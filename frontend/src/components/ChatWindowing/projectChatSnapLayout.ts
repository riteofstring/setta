import {
  type ChatWindowBounds,
  type NormalizedFloatingWindowBounds,
} from "utils/generatedTypes";

export type FloatingSnapPreset =
  | "left"
  | "right"
  | "top"
  | "bottom"
  | "top_left"
  | "top_right"
  | "bottom_left"
  | "bottom_right";

export type FloatingWindowBoundaryInsets = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

type BoundaryEdge = "left" | "right" | "top" | "bottom";

type SnappedFloatingWindow = {
  instanceId: string;
  bounds: ChatWindowBounds;
  snapPreset: FloatingSnapPreset;
};

export type FloatingSnapResizeHandle = {
  axis: "vertical" | "horizontal";
  coordinate: number;
  start: number;
  end: number;
  leadingInstanceIds: string[];
  trailingInstanceIds: string[];
};

type FloatingSnapResizeState = {
  axis: FloatingSnapResizeHandle["axis"];
  coordinate: number;
  leadingInstanceIds: string[];
  trailingInstanceIds: string[];
  startBoundsByInstanceId: Record<string, ChatWindowBounds>;
};

type SnapResizeCandidate = {
  coordinate: number;
  start: number;
  end: number;
  leadingInstanceId: string;
  trailingInstanceId: string;
};

type SnapResizeCandidateGroup = {
  coordinate: number;
  candidates: SnapResizeCandidate[];
};

type BoundaryRect = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

type BoundaryEdgeState = Record<BoundaryEdge, boolean>;

type FloatingSnapPresetDescriptor = {
  xStartFraction: number;
  yStartFraction: number;
  widthFraction: number;
  heightFraction: number;
  requiredEdges: readonly BoundaryEdge[];
  blockedEdges: readonly BoundaryEdge[];
};

const SNAP_BOUNDS_TOLERANCE_PX = 2;
const SNAP_RESIZE_MIN_SPAN_PX = 24;
const FLOATING_SNAP_PRESET_ORDER = [
  "left",
  "right",
  "top",
  "bottom",
  "top_left",
  "top_right",
  "bottom_left",
  "bottom_right",
] as const satisfies readonly FloatingSnapPreset[];
const FLOATING_SNAP_POINTER_PRESET_ORDER = [
  {
    preset: "top_left",
    requiredEdges: ["top", "left"],
  },
  {
    preset: "top_right",
    requiredEdges: ["top", "right"],
  },
  {
    preset: "bottom_left",
    requiredEdges: ["bottom", "left"],
  },
  {
    preset: "bottom_right",
    requiredEdges: ["bottom", "right"],
  },
  {
    preset: "left",
    requiredEdges: ["left"],
  },
  {
    preset: "right",
    requiredEdges: ["right"],
  },
  {
    preset: "top",
    requiredEdges: ["top"],
  },
  {
    preset: "bottom",
    requiredEdges: ["bottom"],
  },
] as const satisfies ReadonlyArray<{
  preset: FloatingSnapPreset;
  requiredEdges: readonly BoundaryEdge[];
}>;
const FLOATING_SNAP_PRESET_DESCRIPTORS = {
  left: {
    xStartFraction: 0,
    yStartFraction: 0,
    widthFraction: 0.5,
    heightFraction: 1,
    requiredEdges: ["left", "top", "bottom"],
    blockedEdges: ["right"],
  },
  right: {
    xStartFraction: 0.5,
    yStartFraction: 0,
    widthFraction: 0.5,
    heightFraction: 1,
    requiredEdges: ["right", "top", "bottom"],
    blockedEdges: ["left"],
  },
  top: {
    xStartFraction: 0,
    yStartFraction: 0,
    widthFraction: 1,
    heightFraction: 0.5,
    requiredEdges: ["top", "left", "right"],
    blockedEdges: ["bottom"],
  },
  bottom: {
    xStartFraction: 0,
    yStartFraction: 0.5,
    widthFraction: 1,
    heightFraction: 0.5,
    requiredEdges: ["bottom", "left", "right"],
    blockedEdges: ["top"],
  },
  top_left: {
    xStartFraction: 0,
    yStartFraction: 0,
    widthFraction: 0.5,
    heightFraction: 0.5,
    requiredEdges: ["left", "top"],
    blockedEdges: ["right", "bottom"],
  },
  top_right: {
    xStartFraction: 0.5,
    yStartFraction: 0,
    widthFraction: 0.5,
    heightFraction: 0.5,
    requiredEdges: ["right", "top"],
    blockedEdges: ["left", "bottom"],
  },
  bottom_left: {
    xStartFraction: 0,
    yStartFraction: 0.5,
    widthFraction: 0.5,
    heightFraction: 0.5,
    requiredEdges: ["left", "bottom"],
    blockedEdges: ["right", "top"],
  },
  bottom_right: {
    xStartFraction: 0.5,
    yStartFraction: 0.5,
    widthFraction: 0.5,
    heightFraction: 0.5,
    requiredEdges: ["right", "bottom"],
    blockedEdges: ["left", "top"],
  },
} satisfies Record<FloatingSnapPreset, FloatingSnapPresetDescriptor>;

function getBoundaryRect(
  viewportWidthPx: number,
  viewportHeightPx: number,
  insets: FloatingWindowBoundaryInsets,
): BoundaryRect {
  const minX = Math.max(0, insets.left);
  const maxX = Math.max(minX + 1, viewportWidthPx - Math.max(0, insets.right));
  const minY = Math.max(0, insets.top);
  const maxY = Math.max(
    minY + 1,
    viewportHeightPx - Math.max(0, insets.bottom),
  );
  return {
    minX,
    maxX,
    minY,
    maxY,
  };
}

function clampFraction(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (value <= 0) {
    return 0;
  }
  if (value >= 1) {
    return 1;
  }
  return value;
}

function areClose(
  a: number,
  b: number,
  tolerancePx = SNAP_BOUNDS_TOLERANCE_PX,
) {
  return Math.abs(a - b) <= tolerancePx;
}

function rangesOverlap(
  startA: number,
  endA: number,
  startB: number,
  endB: number,
): boolean {
  return (
    Math.min(endA, endB) - Math.max(startA, startB) > SNAP_BOUNDS_TOLERANCE_PX
  );
}

function resolveBoundaryEdgeState(
  bounds: ChatWindowBounds,
  rect: BoundaryRect,
): BoundaryEdgeState {
  return {
    left: areClose(bounds.x, rect.minX),
    right: areClose(bounds.x + bounds.width, rect.maxX),
    top: areClose(bounds.y, rect.minY),
    bottom: areClose(bounds.y + bounds.height, rect.maxY),
  };
}

function resolvePointerBoundaryEdgeState(
  pointerX: number,
  pointerY: number,
  rect: BoundaryRect,
  thresholdPx: number,
): BoundaryEdgeState {
  return {
    left: pointerX <= rect.minX + thresholdPx,
    right: pointerX >= rect.maxX - thresholdPx,
    top: pointerY <= rect.minY + thresholdPx,
    bottom: pointerY >= rect.maxY - thresholdPx,
  };
}

function matchesFloatingSnapPreset(
  boundaryEdgeState: BoundaryEdgeState,
  descriptor: FloatingSnapPresetDescriptor,
): boolean {
  return (
    descriptor.requiredEdges.every((edge) => boundaryEdgeState[edge]) &&
    descriptor.blockedEdges.every((edge) => !boundaryEdgeState[edge])
  );
}

function groupResizeCandidates(
  candidates: SnapResizeCandidate[],
): SnapResizeCandidateGroup[] {
  const groups: SnapResizeCandidateGroup[] = [];

  for (const candidate of candidates) {
    const existingGroup = groups.find((group) =>
      areClose(group.coordinate, candidate.coordinate),
    );
    if (existingGroup) {
      existingGroup.candidates.push(candidate);
      existingGroup.coordinate =
        (existingGroup.coordinate * (existingGroup.candidates.length - 1) +
          candidate.coordinate) /
        existingGroup.candidates.length;
      continue;
    }
    groups.push({
      coordinate: candidate.coordinate,
      candidates: [candidate],
    });
  }

  return groups;
}

function buildResizeHandle(
  axis: FloatingSnapResizeHandle["axis"],
  coordinate: number,
  start: number,
  end: number,
  segmentCandidates: SnapResizeCandidate[],
): FloatingSnapResizeHandle | null {
  if (segmentCandidates.length === 0 || end - start < SNAP_RESIZE_MIN_SPAN_PX) {
    return null;
  }

  return {
    axis,
    coordinate,
    start,
    end,
    leadingInstanceIds: Array.from(
      new Set(
        segmentCandidates.map((candidate) => candidate.leadingInstanceId),
      ),
    ),
    trailingInstanceIds: Array.from(
      new Set(
        segmentCandidates.map((candidate) => candidate.trailingInstanceId),
      ),
    ),
  };
}

function mergeCandidateGroup(
  group: SnapResizeCandidateGroup,
  axis: FloatingSnapResizeHandle["axis"],
): FloatingSnapResizeHandle[] {
  const [firstCandidate, ...remainingCandidates] = [...group.candidates].sort(
    (a, b) => a.start - b.start,
  );
  if (!firstCandidate) {
    return [];
  }

  const handles: FloatingSnapResizeHandle[] = [];
  let currentStart = firstCandidate.start;
  let currentEnd = firstCandidate.end;
  let segmentCandidates = [firstCandidate];

  const commitSegment = () => {
    const handle = buildResizeHandle(
      axis,
      group.coordinate,
      currentStart,
      currentEnd,
      segmentCandidates,
    );
    if (handle) {
      handles.push(handle);
    }
  };

  for (const candidate of remainingCandidates) {
    if (candidate.start <= currentEnd + SNAP_BOUNDS_TOLERANCE_PX) {
      currentEnd = Math.max(currentEnd, candidate.end);
      segmentCandidates.push(candidate);
      continue;
    }
    commitSegment();
    currentStart = candidate.start;
    currentEnd = candidate.end;
    segmentCandidates = [candidate];
  }
  commitSegment();

  return handles;
}

function mergeCandidates(
  candidates: SnapResizeCandidate[],
  axis: FloatingSnapResizeHandle["axis"],
): FloatingSnapResizeHandle[] {
  return groupResizeCandidates(candidates).flatMap((group) =>
    mergeCandidateGroup(group, axis),
  );
}

function buildVerticalResizeCandidate(
  windowA: SnappedFloatingWindow,
  windowB: SnappedFloatingWindow,
): SnapResizeCandidate | null {
  const rightA = windowA.bounds.x + windowA.bounds.width;
  const bottomA = windowA.bounds.y + windowA.bounds.height;
  const rightB = windowB.bounds.x + windowB.bounds.width;
  const bottomB = windowB.bounds.y + windowB.bounds.height;

  if (!rangesOverlap(windowA.bounds.y, bottomA, windowB.bounds.y, bottomB)) {
    return null;
  }
  if (areClose(rightA, windowB.bounds.x)) {
    return {
      coordinate: (rightA + windowB.bounds.x) / 2,
      start: Math.max(windowA.bounds.y, windowB.bounds.y),
      end: Math.min(bottomA, bottomB),
      leadingInstanceId: windowA.instanceId,
      trailingInstanceId: windowB.instanceId,
    };
  }
  if (areClose(rightB, windowA.bounds.x)) {
    return {
      coordinate: (rightB + windowA.bounds.x) / 2,
      start: Math.max(windowA.bounds.y, windowB.bounds.y),
      end: Math.min(bottomA, bottomB),
      leadingInstanceId: windowB.instanceId,
      trailingInstanceId: windowA.instanceId,
    };
  }
  return null;
}

function buildHorizontalResizeCandidate(
  windowA: SnappedFloatingWindow,
  windowB: SnappedFloatingWindow,
): SnapResizeCandidate | null {
  const rightA = windowA.bounds.x + windowA.bounds.width;
  const bottomA = windowA.bounds.y + windowA.bounds.height;
  const rightB = windowB.bounds.x + windowB.bounds.width;
  const bottomB = windowB.bounds.y + windowB.bounds.height;

  if (!rangesOverlap(windowA.bounds.x, rightA, windowB.bounds.x, rightB)) {
    return null;
  }
  if (areClose(bottomA, windowB.bounds.y)) {
    return {
      coordinate: (bottomA + windowB.bounds.y) / 2,
      start: Math.max(windowA.bounds.x, windowB.bounds.x),
      end: Math.min(rightA, rightB),
      leadingInstanceId: windowA.instanceId,
      trailingInstanceId: windowB.instanceId,
    };
  }
  if (areClose(bottomB, windowA.bounds.y)) {
    return {
      coordinate: (bottomB + windowA.bounds.y) / 2,
      start: Math.max(windowA.bounds.x, windowB.bounds.x),
      end: Math.min(rightA, rightB),
      leadingInstanceId: windowB.instanceId,
      trailingInstanceId: windowA.instanceId,
    };
  }
  return null;
}

function collectResizeCandidates(windows: SnappedFloatingWindow[]): {
  verticalCandidates: SnapResizeCandidate[];
  horizontalCandidates: SnapResizeCandidate[];
} {
  const verticalCandidates: SnapResizeCandidate[] = [];
  const horizontalCandidates: SnapResizeCandidate[] = [];

  for (let index = 0; index < windows.length; index += 1) {
    const windowA = windows[index];
    if (!windowA) {
      continue;
    }

    for (
      let pairIndex = index + 1;
      pairIndex < windows.length;
      pairIndex += 1
    ) {
      const windowB = windows[pairIndex];
      if (!windowB) {
        continue;
      }

      const verticalCandidate = buildVerticalResizeCandidate(windowA, windowB);
      if (verticalCandidate) {
        verticalCandidates.push(verticalCandidate);
      }

      const horizontalCandidate = buildHorizontalResizeCandidate(
        windowA,
        windowB,
      );
      if (horizontalCandidate) {
        horizontalCandidates.push(horizontalCandidate);
      }
    }
  }

  return {
    verticalCandidates,
    horizontalCandidates,
  };
}

export function buildFloatingSnapBounds(
  preset: FloatingSnapPreset,
  viewportWidthPx: number,
  viewportHeightPx: number,
  insets: FloatingWindowBoundaryInsets,
): ChatWindowBounds {
  const { minX, maxX, minY, maxY } = getBoundaryRect(
    viewportWidthPx,
    viewportHeightPx,
    insets,
  );
  const availableWidthPx = maxX - minX;
  const availableHeightPx = maxY - minY;
  const descriptor = FLOATING_SNAP_PRESET_DESCRIPTORS[preset];
  return {
    x: minX + availableWidthPx * descriptor.xStartFraction,
    y: minY + availableHeightPx * descriptor.yStartFraction,
    width: availableWidthPx * descriptor.widthFraction,
    height: availableHeightPx * descriptor.heightFraction,
  };
}

export function resolveFloatingSnapPresetFromPointer({
  pointerX,
  pointerY,
  viewportWidthPx,
  viewportHeightPx,
  insets,
  thresholdPx = 84,
}: {
  pointerX: number;
  pointerY: number;
  viewportWidthPx: number;
  viewportHeightPx: number;
  insets: FloatingWindowBoundaryInsets;
  thresholdPx?: number;
}): FloatingSnapPreset | null {
  const edgeState = resolvePointerBoundaryEdgeState(
    pointerX,
    pointerY,
    getBoundaryRect(viewportWidthPx, viewportHeightPx, insets),
    thresholdPx,
  );
  const matchingPreset = FLOATING_SNAP_POINTER_PRESET_ORDER.find(
    ({ requiredEdges }) => requiredEdges.every((edge) => edgeState[edge]),
  );
  return matchingPreset?.preset ?? null;
}

export function normalizeFloatingBounds(
  bounds: ChatWindowBounds,
  viewportWidthPx: number,
  viewportHeightPx: number,
  insets: FloatingWindowBoundaryInsets,
): NormalizedFloatingWindowBounds {
  const { minX, maxX, minY, maxY } = getBoundaryRect(
    viewportWidthPx,
    viewportHeightPx,
    insets,
  );
  const availableWidthPx = Math.max(1, maxX - minX);
  const availableHeightPx = Math.max(1, maxY - minY);
  return {
    x: clampFraction((bounds.x - minX) / availableWidthPx),
    y: clampFraction((bounds.y - minY) / availableHeightPx),
    width: clampFraction(bounds.width / availableWidthPx),
    height: clampFraction(bounds.height / availableHeightPx),
  };
}

export function denormalizeFloatingBounds(
  normalizedBounds: NormalizedFloatingWindowBounds,
  viewportWidthPx: number,
  viewportHeightPx: number,
  insets: FloatingWindowBoundaryInsets,
): ChatWindowBounds {
  const { minX, maxX, minY, maxY } = getBoundaryRect(
    viewportWidthPx,
    viewportHeightPx,
    insets,
  );
  const availableWidthPx = Math.max(1, maxX - minX);
  const availableHeightPx = Math.max(1, maxY - minY);
  return {
    x: minX + availableWidthPx * clampFraction(normalizedBounds.x),
    y: minY + availableHeightPx * clampFraction(normalizedBounds.y),
    width: Math.max(
      1,
      availableWidthPx * clampFraction(normalizedBounds.width),
    ),
    height: Math.max(
      1,
      availableHeightPx * clampFraction(normalizedBounds.height),
    ),
  };
}

export function resolveFloatingSnapPresetFromBounds(
  bounds: ChatWindowBounds,
  viewportWidthPx: number,
  viewportHeightPx: number,
  insets: FloatingWindowBoundaryInsets,
): FloatingSnapPreset | null {
  const boundaryEdgeState = resolveBoundaryEdgeState(
    bounds,
    getBoundaryRect(viewportWidthPx, viewportHeightPx, insets),
  );

  return (
    FLOATING_SNAP_PRESET_ORDER.find((preset) =>
      matchesFloatingSnapPreset(
        boundaryEdgeState,
        FLOATING_SNAP_PRESET_DESCRIPTORS[preset],
      ),
    ) ?? null
  );
}

export function buildFloatingSnapResizeHandles(
  windows: SnappedFloatingWindow[],
): FloatingSnapResizeHandle[] {
  const { verticalCandidates, horizontalCandidates } =
    collectResizeCandidates(windows);

  return [
    ...mergeCandidates(verticalCandidates, "vertical"),
    ...mergeCandidates(horizontalCandidates, "horizontal"),
  ].sort((a, b) => {
    if (a.axis === b.axis) {
      return a.coordinate - b.coordinate;
    }
    return a.axis === "vertical" ? -1 : 1;
  });
}

export function buildFloatingSnapResizeBounds(
  resizeState: FloatingSnapResizeState,
  nextCoordinate: number,
): Record<string, ChatWindowBounds> {
  const nextBoundsByInstanceId: Record<string, ChatWindowBounds> = {};

  for (const instanceId of resizeState.leadingInstanceIds) {
    const startBounds = resizeState.startBoundsByInstanceId[instanceId];
    nextBoundsByInstanceId[instanceId] =
      resizeState.axis === "vertical"
        ? {
            ...startBounds,
            width: nextCoordinate - startBounds.x,
          }
        : {
            ...startBounds,
            height: nextCoordinate - startBounds.y,
          };
  }

  for (const instanceId of resizeState.trailingInstanceIds) {
    const startBounds = resizeState.startBoundsByInstanceId[instanceId];
    nextBoundsByInstanceId[instanceId] =
      resizeState.axis === "vertical"
        ? {
            ...startBounds,
            x: nextCoordinate,
            width: startBounds.x + startBounds.width - nextCoordinate,
          }
        : {
            ...startBounds,
            y: nextCoordinate,
            height: startBounds.y + startBounds.height - nextCoordinate,
          };
  }

  return nextBoundsByInstanceId;
}
