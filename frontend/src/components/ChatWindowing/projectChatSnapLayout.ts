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

type BoundaryRect = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

const SNAP_BOUNDS_TOLERANCE_PX = 2;
const SNAP_RESIZE_MIN_SPAN_PX = 24;

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

function mergeCandidates(
  candidates: SnapResizeCandidate[],
): FloatingSnapResizeHandle[] {
  const groups: Array<{
    coordinate: number;
    candidates: SnapResizeCandidate[];
  }> = [];

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

  const handles: FloatingSnapResizeHandle[] = [];
  for (const group of groups) {
    const sortedCandidates = [...group.candidates].sort(
      (a, b) => a.start - b.start,
    );
    let currentStart = sortedCandidates[0]?.start ?? 0;
    let currentEnd = sortedCandidates[0]?.end ?? 0;
    let segmentCandidates = sortedCandidates[0] ? [sortedCandidates[0]] : [];

    const commitSegment = () => {
      if (
        segmentCandidates.length === 0 ||
        currentEnd - currentStart < SNAP_RESIZE_MIN_SPAN_PX
      ) {
        return;
      }
      handles.push({
        axis: "vertical",
        coordinate: group.coordinate,
        start: currentStart,
        end: currentEnd,
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
      });
    };

    for (let index = 1; index < sortedCandidates.length; index += 1) {
      const candidate = sortedCandidates[index];
      if (!candidate) {
        continue;
      }
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
  }

  return handles;
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
  const halfWidth = availableWidthPx / 2;
  const halfHeight = availableHeightPx / 2;

  if (preset === "left") {
    return {
      x: minX,
      y: minY,
      width: halfWidth,
      height: availableHeightPx,
    };
  }
  if (preset === "right") {
    return {
      x: minX + halfWidth,
      y: minY,
      width: halfWidth,
      height: availableHeightPx,
    };
  }
  if (preset === "top") {
    return {
      x: minX,
      y: minY,
      width: availableWidthPx,
      height: halfHeight,
    };
  }
  if (preset === "bottom") {
    return {
      x: minX,
      y: minY + halfHeight,
      width: availableWidthPx,
      height: halfHeight,
    };
  }
  if (preset === "top_left") {
    return {
      x: minX,
      y: minY,
      width: halfWidth,
      height: halfHeight,
    };
  }
  if (preset === "top_right") {
    return {
      x: minX + halfWidth,
      y: minY,
      width: halfWidth,
      height: halfHeight,
    };
  }
  if (preset === "bottom_left") {
    return {
      x: minX,
      y: minY + halfHeight,
      width: halfWidth,
      height: halfHeight,
    };
  }
  return {
    x: minX + halfWidth,
    y: minY + halfHeight,
    width: halfWidth,
    height: halfHeight,
  };
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
  const { minX, maxX, minY, maxY } = getBoundaryRect(
    viewportWidthPx,
    viewportHeightPx,
    insets,
  );
  const touchesLeft = areClose(bounds.x, minX);
  const touchesRight = areClose(bounds.x + bounds.width, maxX);
  const touchesTop = areClose(bounds.y, minY);
  const touchesBottom = areClose(bounds.y + bounds.height, maxY);

  if (touchesLeft && touchesTop && touchesBottom && !touchesRight) {
    return "left";
  }
  if (touchesRight && touchesTop && touchesBottom && !touchesLeft) {
    return "right";
  }
  if (touchesTop && touchesLeft && touchesRight && !touchesBottom) {
    return "top";
  }
  if (touchesBottom && touchesLeft && touchesRight && !touchesTop) {
    return "bottom";
  }
  if (touchesLeft && touchesTop && !touchesRight && !touchesBottom) {
    return "top_left";
  }
  if (touchesRight && touchesTop && !touchesLeft && !touchesBottom) {
    return "top_right";
  }
  if (touchesLeft && touchesBottom && !touchesRight && !touchesTop) {
    return "bottom_left";
  }
  if (touchesRight && touchesBottom && !touchesLeft && !touchesTop) {
    return "bottom_right";
  }
  return null;
}

export function buildFloatingSnapResizeHandles(
  windows: SnappedFloatingWindow[],
): FloatingSnapResizeHandle[] {
  const verticalCandidates: SnapResizeCandidate[] = [];
  const horizontalCandidates: SnapResizeCandidate[] = [];

  for (let index = 0; index < windows.length; index += 1) {
    const windowA = windows[index];
    if (!windowA) {
      continue;
    }
    const rightA = windowA.bounds.x + windowA.bounds.width;
    const bottomA = windowA.bounds.y + windowA.bounds.height;

    for (
      let pairIndex = index + 1;
      pairIndex < windows.length;
      pairIndex += 1
    ) {
      const windowB = windows[pairIndex];
      if (!windowB) {
        continue;
      }
      const rightB = windowB.bounds.x + windowB.bounds.width;
      const bottomB = windowB.bounds.y + windowB.bounds.height;

      if (
        areClose(rightA, windowB.bounds.x) &&
        rangesOverlap(windowA.bounds.y, bottomA, windowB.bounds.y, bottomB)
      ) {
        verticalCandidates.push({
          coordinate: (rightA + windowB.bounds.x) / 2,
          start: Math.max(windowA.bounds.y, windowB.bounds.y),
          end: Math.min(bottomA, bottomB),
          leadingInstanceId: windowA.instanceId,
          trailingInstanceId: windowB.instanceId,
        });
      } else if (
        areClose(rightB, windowA.bounds.x) &&
        rangesOverlap(windowA.bounds.y, bottomA, windowB.bounds.y, bottomB)
      ) {
        verticalCandidates.push({
          coordinate: (rightB + windowA.bounds.x) / 2,
          start: Math.max(windowA.bounds.y, windowB.bounds.y),
          end: Math.min(bottomA, bottomB),
          leadingInstanceId: windowB.instanceId,
          trailingInstanceId: windowA.instanceId,
        });
      }

      if (
        areClose(bottomA, windowB.bounds.y) &&
        rangesOverlap(windowA.bounds.x, rightA, windowB.bounds.x, rightB)
      ) {
        horizontalCandidates.push({
          coordinate: (bottomA + windowB.bounds.y) / 2,
          start: Math.max(windowA.bounds.x, windowB.bounds.x),
          end: Math.min(rightA, rightB),
          leadingInstanceId: windowA.instanceId,
          trailingInstanceId: windowB.instanceId,
        });
      } else if (
        areClose(bottomB, windowA.bounds.y) &&
        rangesOverlap(windowA.bounds.x, rightA, windowB.bounds.x, rightB)
      ) {
        horizontalCandidates.push({
          coordinate: (bottomB + windowA.bounds.y) / 2,
          start: Math.max(windowA.bounds.x, windowB.bounds.x),
          end: Math.min(rightA, rightB),
          leadingInstanceId: windowB.instanceId,
          trailingInstanceId: windowA.instanceId,
        });
      }
    }
  }

  return [
    ...mergeCandidates(verticalCandidates),
    ...mergeCandidates(horizontalCandidates).map((handle) => ({
      ...handle,
      axis: "horizontal" as const,
    })),
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
