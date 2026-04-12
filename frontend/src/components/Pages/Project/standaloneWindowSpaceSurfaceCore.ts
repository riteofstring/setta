import { type FloatingSnapResizeHandle } from "components/ChatWindowing/projectChatSnapLayout";
import {
  type ChatWindowBounds,
  type ChatWindowMode,
  WindowSpaceSurfaceKindEnum,
} from "utils/generatedTypes";

export type StandaloneWindowSpaceWindow = {
  instanceId: string;
  surfaceKind: (typeof WindowSpaceSurfaceKindEnum)[keyof typeof WindowSpaceSurfaceKindEnum];
  sectionIdOrNull: string | null;
  mode: ChatWindowMode;
  title: string;
  chatId: string | null;
  embeddedGitPaneVisible: boolean;
  zIndex: number;
  bounds: ChatWindowBounds;
};

export type ActiveStandaloneSnapResize = {
  pointerId: number;
  axis: FloatingSnapResizeHandle["axis"];
  startPointerPosition: number;
  startCoordinate: number;
  minCoordinate: number;
  maxCoordinate: number;
  leadingInstanceIds: string[];
  trailingInstanceIds: string[];
  startBoundsByInstanceId: Record<string, ChatWindowBounds>;
};

const STANDALONE_WINDOW_SPACE_MIN_WIDTH_PX = 220;
const STANDALONE_WINDOW_SPACE_MIN_HEIGHT_PX = 180;

export function areBoundsEqual(
  a: ChatWindowBounds,
  b: ChatWindowBounds,
): boolean {
  return (
    a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
  );
}

function areStandaloneWindowsEqual(
  a: StandaloneWindowSpaceWindow,
  b: StandaloneWindowSpaceWindow,
): boolean {
  return (
    a.instanceId === b.instanceId &&
    a.surfaceKind === b.surfaceKind &&
    a.sectionIdOrNull === b.sectionIdOrNull &&
    a.mode === b.mode &&
    a.title === b.title &&
    a.chatId === b.chatId &&
    a.embeddedGitPaneVisible === b.embeddedGitPaneVisible &&
    a.zIndex === b.zIndex &&
    areBoundsEqual(a.bounds, b.bounds)
  );
}

function areStandaloneWindowOwnersEqual(
  a: StandaloneWindowSpaceWindow,
  b: StandaloneWindowSpaceWindow,
): boolean {
  return (
    a.surfaceKind === b.surfaceKind &&
    a.sectionIdOrNull === b.sectionIdOrNull &&
    a.mode === b.mode
  );
}

function preferLocallyDivergedStandaloneWindowValue<T>(
  currentValue: T,
  previousHydratedValue: T | undefined,
  nextHydratedValue: T,
  areEqual: (a: T, b: T) => boolean = Object.is,
): T {
  if (previousHydratedValue === undefined) {
    return nextHydratedValue;
  }
  return areEqual(currentValue, previousHydratedValue)
    ? nextHydratedValue
    : currentValue;
}

function mergeHydratedStandaloneWindow(
  currentWindow: StandaloneWindowSpaceWindow,
  previousHydratedWindow: StandaloneWindowSpaceWindow | undefined,
  nextHydratedWindow: StandaloneWindowSpaceWindow,
): StandaloneWindowSpaceWindow {
  if (
    !previousHydratedWindow ||
    !areStandaloneWindowOwnersEqual(currentWindow, nextHydratedWindow)
  ) {
    return nextHydratedWindow;
  }
  return {
    ...nextHydratedWindow,
    chatId: preferLocallyDivergedStandaloneWindowValue(
      currentWindow.chatId,
      previousHydratedWindow.chatId,
      nextHydratedWindow.chatId,
    ),
    embeddedGitPaneVisible: preferLocallyDivergedStandaloneWindowValue(
      currentWindow.embeddedGitPaneVisible,
      previousHydratedWindow.embeddedGitPaneVisible,
      nextHydratedWindow.embeddedGitPaneVisible,
    ),
    zIndex: preferLocallyDivergedStandaloneWindowValue(
      currentWindow.zIndex,
      previousHydratedWindow.zIndex,
      nextHydratedWindow.zIndex,
    ),
    bounds: preferLocallyDivergedStandaloneWindowValue(
      currentWindow.bounds,
      previousHydratedWindow.bounds,
      nextHydratedWindow.bounds,
      areBoundsEqual,
    ),
  };
}

function mergeHydratedStandaloneWindows(
  currentWindowsById: Record<string, StandaloneWindowSpaceWindow>,
  previousHydratedWindowsById: Record<string, StandaloneWindowSpaceWindow>,
  nextHydratedWindowsById: Record<string, StandaloneWindowSpaceWindow>,
): Record<string, StandaloneWindowSpaceWindow> {
  let changed =
    Object.keys(currentWindowsById).length !==
    Object.keys(nextHydratedWindowsById).length;
  const nextWindowsById: Record<string, StandaloneWindowSpaceWindow> = {};

  for (const [instanceId, nextHydratedWindow] of Object.entries(
    nextHydratedWindowsById,
  )) {
    const currentWindow = currentWindowsById[instanceId];
    if (!currentWindow) {
      changed = true;
      nextWindowsById[instanceId] = nextHydratedWindow;
      continue;
    }
    const nextWindow = mergeHydratedStandaloneWindow(
      currentWindow,
      previousHydratedWindowsById[instanceId],
      nextHydratedWindow,
    );
    const windowChanged = !areStandaloneWindowsEqual(currentWindow, nextWindow);
    if (windowChanged) {
      changed = true;
    }
    nextWindowsById[instanceId] = windowChanged ? nextWindow : currentWindow;
  }

  return changed ? nextWindowsById : currentWindowsById;
}

export function applyStandaloneWindowSpaceHydration({
  currentWindowsById,
  previousHydratedWindowsById,
  nextHydratedWindowsById,
  previousHydrationKey,
  nextHydrationKey,
}: {
  currentWindowsById: Record<string, StandaloneWindowSpaceWindow>;
  previousHydratedWindowsById: Record<string, StandaloneWindowSpaceWindow>;
  nextHydratedWindowsById: Record<string, StandaloneWindowSpaceWindow>;
  previousHydrationKey: string;
  nextHydrationKey: string;
}): {
  nextLocalWindowsById: Record<string, StandaloneWindowSpaceWindow>;
  nextPreviousHydratedWindowsById: Record<string, StandaloneWindowSpaceWindow>;
  nextHydrationKey: string;
  resetLocalState: boolean;
} {
  if (previousHydrationKey !== nextHydrationKey) {
    return {
      nextLocalWindowsById: nextHydratedWindowsById,
      nextPreviousHydratedWindowsById: nextHydratedWindowsById,
      nextHydrationKey,
      resetLocalState: true,
    };
  }
  return {
    nextLocalWindowsById: mergeHydratedStandaloneWindows(
      currentWindowsById,
      previousHydratedWindowsById,
      nextHydratedWindowsById,
    ),
    nextPreviousHydratedWindowsById: nextHydratedWindowsById,
    nextHydrationKey,
    resetLocalState: false,
  };
}

type StandaloneSnapResizeLimits = {
  minCoordinate: number;
  maxCoordinate: number;
};

function collectStandaloneSnapResizeStartBounds(
  windowsById: Record<string, StandaloneWindowSpaceWindow>,
  handle: FloatingSnapResizeHandle,
): Record<string, ChatWindowBounds> | null {
  const startBoundsByInstanceId: Record<string, ChatWindowBounds> = {};
  const involvedInstanceIds = [
    ...handle.leadingInstanceIds,
    ...handle.trailingInstanceIds,
  ];
  for (const instanceId of involvedInstanceIds) {
    const bounds = windowsById[instanceId]?.bounds;
    if (!bounds) {
      return null;
    }
    startBoundsByInstanceId[instanceId] = { ...bounds };
  }
  return startBoundsByInstanceId;
}

function resolveVerticalStandaloneSnapResizeLimits(
  startBoundsByInstanceId: Record<string, ChatWindowBounds>,
  leadingInstanceIds: string[],
  trailingInstanceIds: string[],
): StandaloneSnapResizeLimits | null {
  let minCoordinate = -Infinity;
  let maxCoordinate = Infinity;
  for (const instanceId of leadingInstanceIds) {
    const bounds = startBoundsByInstanceId[instanceId];
    if (!bounds) {
      return null;
    }
    minCoordinate = Math.max(
      minCoordinate,
      bounds.x + STANDALONE_WINDOW_SPACE_MIN_WIDTH_PX,
    );
  }
  for (const instanceId of trailingInstanceIds) {
    const bounds = startBoundsByInstanceId[instanceId];
    if (!bounds) {
      return null;
    }
    maxCoordinate = Math.min(
      maxCoordinate,
      bounds.x + bounds.width - STANDALONE_WINDOW_SPACE_MIN_WIDTH_PX,
    );
  }
  return { minCoordinate, maxCoordinate };
}

function resolveHorizontalStandaloneSnapResizeLimits(
  startBoundsByInstanceId: Record<string, ChatWindowBounds>,
  leadingInstanceIds: string[],
  trailingInstanceIds: string[],
): StandaloneSnapResizeLimits | null {
  let minCoordinate = -Infinity;
  let maxCoordinate = Infinity;
  for (const instanceId of leadingInstanceIds) {
    const bounds = startBoundsByInstanceId[instanceId];
    if (!bounds) {
      return null;
    }
    minCoordinate = Math.max(
      minCoordinate,
      bounds.y + STANDALONE_WINDOW_SPACE_MIN_HEIGHT_PX,
    );
  }
  for (const instanceId of trailingInstanceIds) {
    const bounds = startBoundsByInstanceId[instanceId];
    if (!bounds) {
      return null;
    }
    maxCoordinate = Math.min(
      maxCoordinate,
      bounds.y + bounds.height - STANDALONE_WINDOW_SPACE_MIN_HEIGHT_PX,
    );
  }
  return { minCoordinate, maxCoordinate };
}

function resolveStandaloneSnapResizeLimits(
  handle: FloatingSnapResizeHandle,
  startBoundsByInstanceId: Record<string, ChatWindowBounds>,
): StandaloneSnapResizeLimits | null {
  if (handle.axis === "vertical") {
    return resolveVerticalStandaloneSnapResizeLimits(
      startBoundsByInstanceId,
      handle.leadingInstanceIds,
      handle.trailingInstanceIds,
    );
  }
  return resolveHorizontalStandaloneSnapResizeLimits(
    startBoundsByInstanceId,
    handle.leadingInstanceIds,
    handle.trailingInstanceIds,
  );
}

export function createActiveStandaloneSnapResize({
  windowsById,
  handle,
  pointerId,
  pointerX,
  pointerY,
}: {
  windowsById: Record<string, StandaloneWindowSpaceWindow>;
  handle: FloatingSnapResizeHandle;
  pointerId: number;
  pointerX: number;
  pointerY: number;
}): ActiveStandaloneSnapResize | null {
  const startBoundsByInstanceId = collectStandaloneSnapResizeStartBounds(
    windowsById,
    handle,
  );
  if (!startBoundsByInstanceId) {
    return null;
  }
  const limits = resolveStandaloneSnapResizeLimits(
    handle,
    startBoundsByInstanceId,
  );
  if (!limits) {
    return null;
  }
  return {
    pointerId,
    axis: handle.axis,
    startPointerPosition: handle.axis === "vertical" ? pointerX : pointerY,
    startCoordinate: handle.coordinate,
    ...limits,
    leadingInstanceIds: handle.leadingInstanceIds,
    trailingInstanceIds: handle.trailingInstanceIds,
    startBoundsByInstanceId,
  };
}
