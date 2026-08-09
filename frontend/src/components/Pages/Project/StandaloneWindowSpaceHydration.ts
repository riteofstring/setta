import {
  WindowSpaceSurfaceKindEnum,
  type ChatWindowBounds,
  type ChatWindowMode,
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
