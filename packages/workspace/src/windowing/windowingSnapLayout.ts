import {
  createWorkspaceWindowBounds,
  createWorkspaceWindowViewport,
  type WorkspaceFloatingSnapPreset,
  type WorkspaceWindowBoundaryInsets,
  type WorkspaceWindowBounds,
  type WorkspaceWindowViewport,
  WorkspaceWindowingError,
} from "./windowingTypes";

export const WORKSPACE_FLOATING_SNAP_BOUNDS_TOLERANCE_PX = 2;
export const WORKSPACE_FLOATING_SNAP_POINTER_ZONE_PX = 84;
export const WORKSPACE_FLOATING_SNAP_RESIZE_MIN_SPAN_PX = 24;

type WorkspaceWindowBoundaryEdge = "left" | "right" | "top" | "bottom";

interface WorkspaceFloatingSnapPresetDescriptor {
  readonly xStartFraction: number;
  readonly yStartFraction: number;
  readonly widthFraction: number;
  readonly heightFraction: number;
  readonly requiredEdges: readonly WorkspaceWindowBoundaryEdge[];
  readonly blockedEdges: readonly WorkspaceWindowBoundaryEdge[];
}

interface WorkspaceWindowBoundaryEdgeState {
  readonly left: boolean;
  readonly right: boolean;
  readonly top: boolean;
  readonly bottom: boolean;
}

export interface WorkspaceWindowWorkArea {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
  readonly width: number;
  readonly height: number;
}

export interface WorkspaceNormalizedWindowBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface WorkspaceSnappedWindow {
  readonly id: string;
  readonly bounds: WorkspaceWindowBounds;
  readonly snapPreset: WorkspaceFloatingSnapPreset;
}

export interface WorkspaceFloatingSnapResizeSeam {
  readonly axis: "vertical" | "horizontal";
  readonly coordinate: number;
  readonly start: number;
  readonly end: number;
  readonly leadingWindowIds: readonly string[];
  readonly trailingWindowIds: readonly string[];
}

interface SnapResizeCandidate {
  readonly coordinate: number;
  readonly start: number;
  readonly end: number;
  readonly leadingWindowId: string;
  readonly trailingWindowId: string;
}

interface SnapResizeCandidateGroup {
  coordinate: number;
  readonly candidates: SnapResizeCandidate[];
}

const FLOATING_SNAP_PRESET_ORDER = [
  "left",
  "right",
  "top",
  "bottom",
  "top_left",
  "top_right",
  "bottom_left",
  "bottom_right",
] as const satisfies readonly WorkspaceFloatingSnapPreset[];

const FLOATING_SNAP_POINTER_PRESET_ORDER = [
  { preset: "top_left", requiredEdges: ["top", "left"] },
  { preset: "top_right", requiredEdges: ["top", "right"] },
  { preset: "bottom_left", requiredEdges: ["bottom", "left"] },
  { preset: "bottom_right", requiredEdges: ["bottom", "right"] },
  { preset: "left", requiredEdges: ["left"] },
  { preset: "right", requiredEdges: ["right"] },
  { preset: "top", requiredEdges: ["top"] },
  { preset: "bottom", requiredEdges: ["bottom"] },
] as const satisfies ReadonlyArray<{
  readonly preset: WorkspaceFloatingSnapPreset;
  readonly requiredEdges: readonly WorkspaceWindowBoundaryEdge[];
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
} as const satisfies Record<
  WorkspaceFloatingSnapPreset,
  WorkspaceFloatingSnapPresetDescriptor
>;

function clampFraction(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
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
  tolerancePx = WORKSPACE_FLOATING_SNAP_BOUNDS_TOLERANCE_PX,
): boolean {
  return Math.abs(a - b) <= tolerancePx;
}

function rangesOverlap(
  startA: number,
  endA: number,
  startB: number,
  endB: number,
): boolean {
  return (
    Math.min(endA, endB) - Math.max(startA, startB) >
    WORKSPACE_FLOATING_SNAP_BOUNDS_TOLERANCE_PX
  );
}

function resolveBoundaryEdgeState(
  bounds: WorkspaceWindowBounds,
  workArea: WorkspaceWindowWorkArea,
): WorkspaceWindowBoundaryEdgeState {
  return {
    left: areClose(bounds.x, workArea.minX),
    right: areClose(bounds.x + bounds.width, workArea.maxX),
    top: areClose(bounds.y, workArea.minY),
    bottom: areClose(bounds.y + bounds.height, workArea.maxY),
  };
}

function matchesPreset(
  state: WorkspaceWindowBoundaryEdgeState,
  descriptor: WorkspaceFloatingSnapPresetDescriptor,
): boolean {
  return (
    descriptor.requiredEdges.every((edge) => state[edge]) &&
    descriptor.blockedEdges.every((edge) => !state[edge])
  );
}

function assertFinitePointer(value: number, owner: string): void {
  if (!Number.isFinite(value)) {
    throw new WorkspaceWindowingError(
      "invalid_input",
      `${owner} must be finite.`,
    );
  }
}

function assertSnapPreset(value: WorkspaceFloatingSnapPreset): void {
  if (!Object.hasOwn(FLOATING_SNAP_PRESET_DESCRIPTORS, value)) {
    throw new WorkspaceWindowingError(
      "invalid_input",
      "Unknown floating snap preset.",
    );
  }
}

/**
 * Matches frozen-main behavior: negative insets are ignored and a pathological
 * host still yields a one-pixel work area instead of a negative rectangle.
 */
export function resolveWorkspaceWindowWorkArea(
  viewportInput: WorkspaceWindowViewport,
): WorkspaceWindowWorkArea {
  const viewport = createWorkspaceWindowViewport(viewportInput);
  const { left, right, top, bottom } = viewport.insets;
  const minX = Math.max(0, left);
  const maxX = Math.max(minX + 1, viewport.width - Math.max(0, right));
  const minY = Math.max(0, top);
  const maxY = Math.max(minY + 1, viewport.height - Math.max(0, bottom));
  return Object.freeze({
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  });
}

export function buildWorkspaceFloatingSnapBounds(
  preset: WorkspaceFloatingSnapPreset,
  viewport: WorkspaceWindowViewport,
): WorkspaceWindowBounds {
  assertSnapPreset(preset);
  const workArea = resolveWorkspaceWindowWorkArea(viewport);
  const descriptor = FLOATING_SNAP_PRESET_DESCRIPTORS[preset];
  return Object.freeze({
    x: workArea.minX + workArea.width * descriptor.xStartFraction,
    y: workArea.minY + workArea.height * descriptor.yStartFraction,
    width: workArea.width * descriptor.widthFraction,
    height: workArea.height * descriptor.heightFraction,
  });
}

export interface ResolveWorkspaceFloatingSnapPresetFromPointerInput {
  readonly pointerX: number;
  readonly pointerY: number;
  readonly viewport: WorkspaceWindowViewport;
  readonly thresholdPx?: number;
}

/** Corners intentionally precede edges, matching the reference snap preview. */
export function resolveWorkspaceFloatingSnapPresetFromPointer({
  pointerX,
  pointerY,
  viewport,
  thresholdPx = WORKSPACE_FLOATING_SNAP_POINTER_ZONE_PX,
}: ResolveWorkspaceFloatingSnapPresetFromPointerInput): WorkspaceFloatingSnapPreset | null {
  assertFinitePointer(pointerX, "Workspace floating snap pointerX");
  assertFinitePointer(pointerY, "Workspace floating snap pointerY");
  if (!Number.isFinite(thresholdPx) || thresholdPx < 0) {
    throw new WorkspaceWindowingError(
      "invalid_input",
      "Workspace floating snap threshold must be a nonnegative finite number.",
    );
  }
  const workArea = resolveWorkspaceWindowWorkArea(viewport);
  const edgeState: WorkspaceWindowBoundaryEdgeState = {
    left: pointerX <= workArea.minX + thresholdPx,
    right: pointerX >= workArea.maxX - thresholdPx,
    top: pointerY <= workArea.minY + thresholdPx,
    bottom: pointerY >= workArea.maxY - thresholdPx,
  };
  return (
    FLOATING_SNAP_POINTER_PRESET_ORDER.find(({ requiredEdges }) =>
      requiredEdges.every((edge) => edgeState[edge]),
    )?.preset ?? null
  );
}

/**
 * Edge anchoring, rather than the original half/quarter dimensions, identifies
 * a snap. This keeps split-resized tiles snapped.
 */
export function classifyWorkspaceFloatingSnapPreset(
  boundsInput: WorkspaceWindowBounds,
  viewport: WorkspaceWindowViewport,
): WorkspaceFloatingSnapPreset | null {
  const bounds = createWorkspaceWindowBounds(boundsInput);
  const edgeState = resolveBoundaryEdgeState(
    bounds,
    resolveWorkspaceWindowWorkArea(viewport),
  );
  return (
    FLOATING_SNAP_PRESET_ORDER.find((preset) =>
      matchesPreset(edgeState, FLOATING_SNAP_PRESET_DESCRIPTORS[preset]),
    ) ?? null
  );
}

export function normalizeWorkspaceWindowBounds(
  boundsInput: WorkspaceWindowBounds,
  viewport: WorkspaceWindowViewport,
): WorkspaceNormalizedWindowBounds {
  const bounds = createWorkspaceWindowBounds(boundsInput);
  const workArea = resolveWorkspaceWindowWorkArea(viewport);
  const width = Math.max(1, workArea.width);
  const height = Math.max(1, workArea.height);
  return Object.freeze({
    x: clampFraction((bounds.x - workArea.minX) / width),
    y: clampFraction((bounds.y - workArea.minY) / height),
    width: clampFraction(bounds.width / width),
    height: clampFraction(bounds.height / height),
  });
}

/**
 * Normalized values are clamped on this geometry boundary to preserve the
 * reference behavior for stale persisted fractions.
 */
export function denormalizeWorkspaceWindowBounds(
  normalizedBounds: WorkspaceNormalizedWindowBounds,
  viewport: WorkspaceWindowViewport,
): WorkspaceWindowBounds {
  const workArea = resolveWorkspaceWindowWorkArea(viewport);
  const width = Math.max(1, workArea.width);
  const height = Math.max(1, workArea.height);
  return Object.freeze({
    x: workArea.minX + width * clampFraction(normalizedBounds.x),
    y: workArea.minY + height * clampFraction(normalizedBounds.y),
    width: Math.max(1, width * clampFraction(normalizedBounds.width)),
    height: Math.max(1, height * clampFraction(normalizedBounds.height)),
  });
}

function buildVerticalResizeCandidate(
  first: WorkspaceSnappedWindow,
  second: WorkspaceSnappedWindow,
): SnapResizeCandidate | null {
  const firstRight = first.bounds.x + first.bounds.width;
  const firstBottom = first.bounds.y + first.bounds.height;
  const secondRight = second.bounds.x + second.bounds.width;
  const secondBottom = second.bounds.y + second.bounds.height;
  if (
    !rangesOverlap(first.bounds.y, firstBottom, second.bounds.y, secondBottom)
  ) {
    return null;
  }
  if (areClose(firstRight, second.bounds.x)) {
    return {
      coordinate: (firstRight + second.bounds.x) / 2,
      start: Math.max(first.bounds.y, second.bounds.y),
      end: Math.min(firstBottom, secondBottom),
      leadingWindowId: first.id,
      trailingWindowId: second.id,
    };
  }
  if (areClose(secondRight, first.bounds.x)) {
    return {
      coordinate: (secondRight + first.bounds.x) / 2,
      start: Math.max(first.bounds.y, second.bounds.y),
      end: Math.min(firstBottom, secondBottom),
      leadingWindowId: second.id,
      trailingWindowId: first.id,
    };
  }
  return null;
}

function buildHorizontalResizeCandidate(
  first: WorkspaceSnappedWindow,
  second: WorkspaceSnappedWindow,
): SnapResizeCandidate | null {
  const firstRight = first.bounds.x + first.bounds.width;
  const firstBottom = first.bounds.y + first.bounds.height;
  const secondRight = second.bounds.x + second.bounds.width;
  const secondBottom = second.bounds.y + second.bounds.height;
  if (
    !rangesOverlap(first.bounds.x, firstRight, second.bounds.x, secondRight)
  ) {
    return null;
  }
  if (areClose(firstBottom, second.bounds.y)) {
    return {
      coordinate: (firstBottom + second.bounds.y) / 2,
      start: Math.max(first.bounds.x, second.bounds.x),
      end: Math.min(firstRight, secondRight),
      leadingWindowId: first.id,
      trailingWindowId: second.id,
    };
  }
  if (areClose(secondBottom, first.bounds.y)) {
    return {
      coordinate: (secondBottom + first.bounds.y) / 2,
      start: Math.max(first.bounds.x, second.bounds.x),
      end: Math.min(firstRight, secondRight),
      leadingWindowId: second.id,
      trailingWindowId: first.id,
    };
  }
  return null;
}

function groupCandidates(
  candidates: readonly SnapResizeCandidate[],
): SnapResizeCandidateGroup[] {
  const groups: SnapResizeCandidateGroup[] = [];
  for (const candidate of candidates) {
    const existing = groups.find((group) =>
      areClose(group.coordinate, candidate.coordinate),
    );
    if (existing) {
      existing.candidates.push(candidate);
      existing.coordinate =
        (existing.coordinate * (existing.candidates.length - 1) +
          candidate.coordinate) /
        existing.candidates.length;
    } else {
      groups.push({
        coordinate: candidate.coordinate,
        candidates: [candidate],
      });
    }
  }
  return groups;
}

function buildSeam(
  axis: WorkspaceFloatingSnapResizeSeam["axis"],
  coordinate: number,
  start: number,
  end: number,
  candidates: readonly SnapResizeCandidate[],
): WorkspaceFloatingSnapResizeSeam | null {
  if (
    candidates.length === 0 ||
    end - start < WORKSPACE_FLOATING_SNAP_RESIZE_MIN_SPAN_PX
  ) {
    return null;
  }
  return Object.freeze({
    axis,
    coordinate,
    start,
    end,
    leadingWindowIds: Object.freeze(
      Array.from(
        new Set(candidates.map((candidate) => candidate.leadingWindowId)),
      ),
    ),
    trailingWindowIds: Object.freeze(
      Array.from(
        new Set(candidates.map((candidate) => candidate.trailingWindowId)),
      ),
    ),
  });
}

function mergeCandidateGroup(
  group: SnapResizeCandidateGroup,
  axis: WorkspaceFloatingSnapResizeSeam["axis"],
): WorkspaceFloatingSnapResizeSeam[] {
  const sorted = [...group.candidates].sort(
    (first, second) => first.start - second.start,
  );
  const first = sorted[0];
  if (!first) {
    return [];
  }
  const seams: WorkspaceFloatingSnapResizeSeam[] = [];
  let currentStart = first.start;
  let currentEnd = first.end;
  let segmentCandidates = [first];
  const commit = () => {
    const seam = buildSeam(
      axis,
      group.coordinate,
      currentStart,
      currentEnd,
      segmentCandidates,
    );
    if (seam) {
      seams.push(seam);
    }
  };
  for (const candidate of sorted.slice(1)) {
    if (
      candidate.start <=
      currentEnd + WORKSPACE_FLOATING_SNAP_BOUNDS_TOLERANCE_PX
    ) {
      currentEnd = Math.max(currentEnd, candidate.end);
      segmentCandidates.push(candidate);
    } else {
      commit();
      currentStart = candidate.start;
      currentEnd = candidate.end;
      segmentCandidates = [candidate];
    }
  }
  commit();
  return seams;
}

function mergeCandidates(
  candidates: readonly SnapResizeCandidate[],
  axis: WorkspaceFloatingSnapResizeSeam["axis"],
): WorkspaceFloatingSnapResizeSeam[] {
  return groupCandidates(candidates).flatMap((group) =>
    mergeCandidateGroup(group, axis),
  );
}

function validateSnappedWindows(
  windows: readonly WorkspaceSnappedWindow[],
): void {
  const ids = new Set<string>();
  for (const window of windows) {
    if (typeof window.id !== "string" || window.id.trim().length === 0) {
      throw new WorkspaceWindowingError(
        "invalid_input",
        "A snapped window requires an id.",
      );
    }
    if (ids.has(window.id)) {
      throw new WorkspaceWindowingError(
        "duplicate_window_id",
        `Snap seam input contains duplicate window id ${window.id}.`,
      );
    }
    ids.add(window.id);
    createWorkspaceWindowBounds(window.bounds);
    assertSnapPreset(window.snapPreset);
  }
}

function collectSnapResizeCandidates(
  windows: readonly WorkspaceSnappedWindow[],
): {
  readonly vertical: readonly SnapResizeCandidate[];
  readonly horizontal: readonly SnapResizeCandidate[];
} {
  const vertical: SnapResizeCandidate[] = [];
  const horizontal: SnapResizeCandidate[] = [];
  for (let index = 0; index < windows.length; index += 1) {
    const first = windows[index];
    if (!first) {
      continue;
    }
    for (
      let pairedIndex = index + 1;
      pairedIndex < windows.length;
      pairedIndex += 1
    ) {
      const second = windows[pairedIndex];
      if (!second) {
        continue;
      }
      const verticalCandidate = buildVerticalResizeCandidate(first, second);
      if (verticalCandidate) {
        vertical.push(verticalCandidate);
      }
      const horizontalCandidate = buildHorizontalResizeCandidate(first, second);
      if (horizontalCandidate) {
        horizontal.push(horizontalCandidate);
      }
    }
  }
  return { vertical, horizontal };
}

/**
 * Finds the exposed, merged seams between already-snapped windows. Input order
 * remains the deterministic tie breaker for leading/trailing id arrays.
 */
export function buildWorkspaceFloatingSnapResizeSeams(
  windows: readonly WorkspaceSnappedWindow[],
): readonly WorkspaceFloatingSnapResizeSeam[] {
  validateSnappedWindows(windows);
  const { vertical, horizontal } = collectSnapResizeCandidates(windows);
  return Object.freeze(
    [
      ...mergeCandidates(vertical, "vertical"),
      ...mergeCandidates(horizontal, "horizontal"),
    ].sort((first, second) =>
      first.axis === second.axis
        ? first.coordinate - second.coordinate
        : first.axis === "vertical"
          ? -1
          : 1,
    ),
  );
}

/**
 * Moves a complete seam in one pure calculation. Callers validate the supplied
 * coordinate against the chosen live/standalone minimum dimensions first.
 */
export function buildWorkspaceFloatingSnapResizeBounds(
  seam: WorkspaceFloatingSnapResizeSeam,
  startBoundsByWindowId: Readonly<Record<string, WorkspaceWindowBounds>>,
  nextCoordinate: number,
): Readonly<Record<string, WorkspaceWindowBounds>> {
  assertFinitePointer(
    nextCoordinate,
    "Workspace floating snap resize coordinate",
  );
  const next: Record<string, WorkspaceWindowBounds> = {};
  for (const id of seam.leadingWindowIds) {
    const start = startBoundsByWindowId[id];
    if (!start) {
      throw new WorkspaceWindowingError(
        "invalid_input",
        `Snap resize is missing leading window bounds for ${id}.`,
      );
    }
    const bounds = createWorkspaceWindowBounds(start);
    next[id] = Object.freeze(
      seam.axis === "vertical"
        ? { ...bounds, width: nextCoordinate - bounds.x }
        : { ...bounds, height: nextCoordinate - bounds.y },
    );
  }
  for (const id of seam.trailingWindowIds) {
    const start = startBoundsByWindowId[id];
    if (!start) {
      throw new WorkspaceWindowingError(
        "invalid_input",
        `Snap resize is missing trailing window bounds for ${id}.`,
      );
    }
    const bounds = createWorkspaceWindowBounds(start);
    next[id] = Object.freeze(
      seam.axis === "vertical"
        ? {
            ...bounds,
            x: nextCoordinate,
            width: bounds.x + bounds.width - nextCoordinate,
          }
        : {
            ...bounds,
            y: nextCoordinate,
            height: bounds.y + bounds.height - nextCoordinate,
          },
    );
  }
  return Object.freeze(next);
}

export function createWorkspaceWindowBoundaryInsets(
  insets: WorkspaceWindowBoundaryInsets,
): WorkspaceWindowBoundaryInsets {
  return createWorkspaceWindowViewport({ width: 1, height: 1, insets }).insets;
}
