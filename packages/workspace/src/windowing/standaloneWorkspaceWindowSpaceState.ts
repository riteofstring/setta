import {
  buildWorkspaceFloatingSnapResizeBounds,
  denormalizeWorkspaceWindowBounds,
  type WorkspaceFloatingSnapResizeSeam,
} from "./windowingSnapLayout";
import {
  createWorkspaceFloatingWindow,
  type WorkspaceFloatingWindow,
  type WorkspaceWindowBounds,
  type WorkspaceWindowViewport,
} from "./windowingTypes";
import type { WorkspaceWindowSpace } from "./windowSpaces";

const STANDALONE_WORKSPACE_WINDOW_MIN_WIDTH_PX = 220;
const STANDALONE_WORKSPACE_WINDOW_MIN_HEIGHT_PX = 180;

export type StandaloneWorkspaceWindow = WorkspaceFloatingWindow;

export interface ActiveStandaloneWorkspaceSnapResize {
  readonly pointerId: number;
  readonly seam: WorkspaceFloatingSnapResizeSeam;
  readonly startPointerPosition: number;
  readonly startBoundsByWindowId: Readonly<
    Record<string, WorkspaceWindowBounds>
  >;
  readonly minCoordinate: number;
  readonly maxCoordinate: number;
}

interface StandaloneWorkspaceWindowSpaceHydrationResult {
  readonly localWindows: readonly StandaloneWorkspaceWindow[];
  readonly previousHydratedWindows: readonly StandaloneWorkspaceWindow[];
  readonly previousKey: string;
  readonly resetLocalState: boolean;
}

function areBoundsEqual(
  first: WorkspaceWindowBounds,
  second: WorkspaceWindowBounds,
): boolean {
  return (
    first.x === second.x &&
    first.y === second.y &&
    first.width === second.width &&
    first.height === second.height
  );
}

function hasSameStandaloneWindowOwner(
  first: StandaloneWorkspaceWindow,
  second: StandaloneWorkspaceWindow,
): boolean {
  return (
    first.id === second.id &&
    first.contentId === second.contentId &&
    first.surfaceKind === second.surfaceKind
  );
}

function mergeStandaloneWorkspaceWindow(
  current: StandaloneWorkspaceWindow,
  previousHydrated: StandaloneWorkspaceWindow | undefined,
  nextHydrated: StandaloneWorkspaceWindow,
): StandaloneWorkspaceWindow {
  if (
    !previousHydrated ||
    !hasSameStandaloneWindowOwner(current, nextHydrated)
  ) {
    return nextHydrated;
  }
  return {
    ...nextHydrated,
    bounds: areBoundsEqual(current.bounds, previousHydrated.bounds)
      ? nextHydrated.bounds
      : current.bounds,
    zIndex:
      current.zIndex === previousHydrated.zIndex
        ? nextHydrated.zIndex
        : current.zIndex,
  };
}

function createWindowById(
  windows: readonly StandaloneWorkspaceWindow[],
): ReadonlyMap<string, StandaloneWorkspaceWindow> {
  return new Map(windows.map((window) => [window.id, window]));
}

function mergeStandaloneWorkspaceWindows(
  currentWindows: readonly StandaloneWorkspaceWindow[],
  previousHydratedWindows: readonly StandaloneWorkspaceWindow[],
  nextHydratedWindows: readonly StandaloneWorkspaceWindow[],
): readonly StandaloneWorkspaceWindow[] {
  const currentById = createWindowById(currentWindows);
  const previousById = createWindowById(previousHydratedWindows);
  return nextHydratedWindows.map((nextWindow) => {
    const current = currentById.get(nextWindow.id);
    return current
      ? mergeStandaloneWorkspaceWindow(
          current,
          previousById.get(nextWindow.id),
          nextWindow,
        )
      : nextWindow;
  });
}

export function hydrateStandaloneWorkspaceWindowSpace(
  space: WorkspaceWindowSpace,
  viewport: WorkspaceWindowViewport,
): readonly StandaloneWorkspaceWindow[] {
  return space.windows.map((window) =>
    createWorkspaceFloatingWindow({
      id: window.id,
      contentId: window.contentId,
      surfaceKind: window.surfaceKind,
      title: window.title,
      rendererData: window.rendererData,
      sectionId: window.sectionId,
      bounds: denormalizeWorkspaceWindowBounds(
        window.normalizedBounds,
        viewport,
      ),
      placement: "floating",
      restoreBounds: null,
      restorePlacement: null,
      lastUnsnappedBounds: null,
      isMinimized: false,
      isClosed: false,
      zIndex: window.zIndex,
    }),
  );
}

export function hydrateStandaloneWorkspaceWindowSpaceState({
  currentWindows,
  previousHydratedWindows,
  nextHydratedWindows,
  previousKey,
  nextKey,
}: {
  readonly currentWindows: readonly StandaloneWorkspaceWindow[];
  readonly previousHydratedWindows: readonly StandaloneWorkspaceWindow[];
  readonly nextHydratedWindows: readonly StandaloneWorkspaceWindow[];
  readonly previousKey: string;
  readonly nextKey: string;
}): StandaloneWorkspaceWindowSpaceHydrationResult {
  const resetLocalState = previousKey !== nextKey;
  return {
    localWindows: resetLocalState
      ? nextHydratedWindows
      : mergeStandaloneWorkspaceWindows(
          currentWindows,
          previousHydratedWindows,
          nextHydratedWindows,
        ),
    previousHydratedWindows: nextHydratedWindows,
    previousKey: nextKey,
    resetLocalState,
  };
}

export function focusStandaloneWorkspaceWindow(
  windows: readonly StandaloneWorkspaceWindow[],
  windowId: string,
): readonly StandaloneWorkspaceWindow[] {
  const target = windows.find((window) => window.id === windowId);
  if (!target) {
    return windows;
  }
  const highestZIndex = windows.reduce(
    (highest, window) => Math.max(highest, window.zIndex),
    target.zIndex,
  );
  const isUniqueTopWindow = windows.every(
    (window) => window.id === target.id || target.zIndex > window.zIndex,
  );
  if (isUniqueTopWindow) {
    return windows;
  }
  return windows.map((window) =>
    window.id === windowId ? { ...window, zIndex: highestZIndex + 1 } : window,
  );
}

function collectResizeStartBounds(
  windows: readonly StandaloneWorkspaceWindow[],
  seam: WorkspaceFloatingSnapResizeSeam,
): Readonly<Record<string, WorkspaceWindowBounds>> | null {
  const windowsById = createWindowById(windows);
  const boundsById: Record<string, WorkspaceWindowBounds> = {};
  const involvedIds = [...seam.leadingWindowIds, ...seam.trailingWindowIds];
  for (const id of involvedIds) {
    const bounds = windowsById.get(id)?.bounds;
    if (!bounds) {
      return null;
    }
    boundsById[id] = { ...bounds };
  }
  return Object.freeze(boundsById);
}

function resolveResizeLimits(
  seam: WorkspaceFloatingSnapResizeSeam,
  startBoundsByWindowId: Readonly<Record<string, WorkspaceWindowBounds>>,
): { readonly minCoordinate: number; readonly maxCoordinate: number } | null {
  let minCoordinate = Number.NEGATIVE_INFINITY;
  for (const id of seam.leadingWindowIds) {
    const bounds = startBoundsByWindowId[id];
    if (!bounds) {
      return null;
    }
    const minimum =
      seam.axis === "vertical"
        ? bounds.x + STANDALONE_WORKSPACE_WINDOW_MIN_WIDTH_PX
        : bounds.y + STANDALONE_WORKSPACE_WINDOW_MIN_HEIGHT_PX;
    minCoordinate = Math.max(minCoordinate, minimum);
  }
  let maxCoordinate = Number.POSITIVE_INFINITY;
  for (const id of seam.trailingWindowIds) {
    const bounds = startBoundsByWindowId[id];
    if (!bounds) {
      return null;
    }
    const maximum =
      seam.axis === "vertical"
        ? bounds.x + bounds.width - STANDALONE_WORKSPACE_WINDOW_MIN_WIDTH_PX
        : bounds.y + bounds.height - STANDALONE_WORKSPACE_WINDOW_MIN_HEIGHT_PX;
    maxCoordinate = Math.min(maxCoordinate, maximum);
  }
  return minCoordinate <= maxCoordinate
    ? { minCoordinate, maxCoordinate }
    : null;
}

export function createActiveStandaloneWorkspaceSnapResize({
  windows,
  seam,
  pointerId,
  pointerX,
  pointerY,
}: {
  readonly windows: readonly StandaloneWorkspaceWindow[];
  readonly seam: WorkspaceFloatingSnapResizeSeam;
  readonly pointerId: number;
  readonly pointerX: number;
  readonly pointerY: number;
}): ActiveStandaloneWorkspaceSnapResize | null {
  const startBoundsByWindowId = collectResizeStartBounds(windows, seam);
  if (!startBoundsByWindowId) {
    return null;
  }
  const limits = resolveResizeLimits(seam, startBoundsByWindowId);
  if (!limits) {
    return null;
  }
  return {
    pointerId,
    seam,
    startPointerPosition: seam.axis === "vertical" ? pointerX : pointerY,
    startBoundsByWindowId,
    ...limits,
  };
}

export function resolveActiveStandaloneWorkspaceSnapResizeBounds(
  active: ActiveStandaloneWorkspaceSnapResize,
  pointerX: number,
  pointerY: number,
): Readonly<Record<string, WorkspaceWindowBounds>> {
  const pointerPosition = active.seam.axis === "vertical" ? pointerX : pointerY;
  const nextCoordinate = Math.min(
    Math.max(
      active.seam.coordinate + (pointerPosition - active.startPointerPosition),
      active.minCoordinate,
    ),
    active.maxCoordinate,
  );
  return buildWorkspaceFloatingSnapResizeBounds(
    active.seam,
    active.startBoundsByWindowId,
    nextCoordinate,
  );
}

export function applyStandaloneWorkspaceWindowBounds(
  windows: readonly StandaloneWorkspaceWindow[],
  boundsByWindowId: Readonly<Record<string, WorkspaceWindowBounds>>,
): readonly StandaloneWorkspaceWindow[] {
  return windows.map((window) => {
    const bounds = boundsByWindowId[window.id];
    return bounds ? { ...window, bounds } : window;
  });
}
