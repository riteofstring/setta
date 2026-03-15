import {
  denormalizeFloatingBounds,
  type FloatingWindowBoundaryInsets,
} from "components/ChatWindowing/projectChatSnapLayout";
import { buildProjectChatWindowTitle } from "components/ChatWindowing/projectChatWindowTitles";
import {
  ChatWindowModeEnum,
  WindowSpaceSurfaceKindEnum,
  type ChatWindowBounds,
  type ChatWindowMode,
  type WindowSpaceConfig,
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

export type StandaloneWindowSpaceWindowMap = Record<
  string,
  StandaloneWindowSpaceWindow
>;

const EMPTY_FLOATING_WINDOW_INSETS: FloatingWindowBoundaryInsets = {
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
};

function resolveStandaloneWindowSpaceChatId(
  mode: ChatWindowMode,
  chatId: string | null | undefined,
): string | null {
  if (mode !== ChatWindowModeEnum.project_ai_mode) {
    return null;
  }
  return chatId ?? null;
}

export function canControlStandaloneWindowChatId(
  window: StandaloneWindowSpaceWindow,
): boolean {
  return window.mode === ChatWindowModeEnum.project_ai_mode;
}

export function hydrateWindowSpaceWindows(
  windowSpace: WindowSpaceConfig,
  viewportWidthPx: number,
  viewportHeightPx: number,
  sectionNamesById: Record<string, string>,
): StandaloneWindowSpaceWindowMap {
  const hydratedWindowsById: StandaloneWindowSpaceWindowMap = {};
  const winningInstanceIdBySectionId = new Map<string, string>();
  const orderedInstanceIds = [
    ...windowSpace.order,
    ...Object.keys(windowSpace.windowsById),
  ];
  const seen = new Set<string>();
  for (const instanceId of orderedInstanceIds) {
    if (seen.has(instanceId)) {
      continue;
    }
    seen.add(instanceId);
    const window = windowSpace.windowsById[instanceId];
    if (!window) {
      continue;
    }
    if (
      window.surfaceKind === WindowSpaceSurfaceKindEnum.section &&
      !window.sectionIdOrNull
    ) {
      continue;
    }
    const hydratedWindow: StandaloneWindowSpaceWindow = {
      instanceId,
      surfaceKind: window.surfaceKind,
      sectionIdOrNull: window.sectionIdOrNull ?? null,
      mode: window.mode,
      title: buildProjectChatWindowTitle(
        window.mode,
        instanceId,
        window.sectionIdOrNull ?? null,
        window.title,
        sectionNamesById,
      ),
      chatId: resolveStandaloneWindowSpaceChatId(window.mode, window.chatId),
      embeddedGitPaneVisible: window.embeddedGitPaneVisible,
      zIndex: window.zIndex,
      bounds: denormalizeFloatingBounds(
        window.normalizedBounds,
        viewportWidthPx,
        viewportHeightPx,
        EMPTY_FLOATING_WINDOW_INSETS,
      ),
    };
    const sectionId = hydratedWindow.sectionIdOrNull;
    if (sectionId) {
      const currentBestInstanceId =
        winningInstanceIdBySectionId.get(sectionId) ?? null;
      const currentBestWindow =
        currentBestInstanceId === null
          ? null
          : hydratedWindowsById[currentBestInstanceId] ?? null;
      if (
        currentBestWindow &&
        (currentBestWindow.zIndex > hydratedWindow.zIndex ||
          (currentBestWindow.zIndex === hydratedWindow.zIndex &&
            currentBestInstanceId.localeCompare(instanceId) >= 0))
      ) {
        continue;
      }
      if (currentBestInstanceId !== null) {
        delete hydratedWindowsById[currentBestInstanceId];
      }
      winningInstanceIdBySectionId.set(sectionId, instanceId);
    }
    hydratedWindowsById[instanceId] = hydratedWindow;
  }
  return hydratedWindowsById;
}

export function focusStandaloneWindow(
  windowsById: StandaloneWindowSpaceWindowMap,
  instanceId: string,
): StandaloneWindowSpaceWindowMap {
  const current = windowsById[instanceId];
  if (!current) {
    return windowsById;
  }
  let highestZIndex = current.zIndex;
  for (const candidate of Object.values(windowsById)) {
    if (candidate.zIndex > highestZIndex) {
      highestZIndex = candidate.zIndex;
    }
  }
  if (current.zIndex === highestZIndex) {
    return windowsById;
  }
  return {
    ...windowsById,
    [instanceId]: {
      ...current,
      zIndex: highestZIndex + 1,
    },
  };
}

function areBoundsEqual(a: ChatWindowBounds, b: ChatWindowBounds): boolean {
  return (
    a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
  );
}

export function updateStandaloneWindowBounds(
  windowsById: StandaloneWindowSpaceWindowMap,
  nextBoundsByInstanceId: Record<string, ChatWindowBounds>,
): StandaloneWindowSpaceWindowMap {
  let nextWindowsById = windowsById;
  for (const [instanceId, nextBounds] of Object.entries(
    nextBoundsByInstanceId,
  )) {
    const current = nextWindowsById[instanceId];
    if (!current || areBoundsEqual(current.bounds, nextBounds)) {
      continue;
    }
    if (nextWindowsById === windowsById) {
      nextWindowsById = { ...windowsById };
    }
    nextWindowsById[instanceId] = {
      ...current,
      bounds: nextBounds,
    };
  }
  return nextWindowsById;
}

export function setStandaloneProjectChatWindowChatId(
  windowsById: StandaloneWindowSpaceWindowMap,
  instanceId: string,
  chatId: string | null | undefined,
): StandaloneWindowSpaceWindowMap {
  const current = windowsById[instanceId];
  if (!current || current.mode !== ChatWindowModeEnum.project_ai_mode) {
    return windowsById;
  }
  const normalizedChatId = chatId?.trim() ? chatId.trim() : null;
  if (current.chatId === normalizedChatId) {
    return windowsById;
  }
  return {
    ...windowsById,
    [instanceId]: {
      ...current,
      chatId: normalizedChatId,
    },
  };
}

export function setStandaloneEmbeddedGitPaneVisibility(
  windowsById: StandaloneWindowSpaceWindowMap,
  instanceId: string,
  visible: boolean,
): StandaloneWindowSpaceWindowMap {
  const current = windowsById[instanceId];
  if (!current || current.embeddedGitPaneVisible === visible) {
    return windowsById;
  }
  return {
    ...windowsById,
    [instanceId]: {
      ...current,
      embeddedGitPaneVisible: visible,
    },
  };
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

export function mergeHydratedStandaloneWindows(
  currentWindowsById: StandaloneWindowSpaceWindowMap,
  previousHydratedWindowsById: StandaloneWindowSpaceWindowMap,
  nextHydratedWindowsById: StandaloneWindowSpaceWindowMap,
): StandaloneWindowSpaceWindowMap {
  let changed =
    Object.keys(currentWindowsById).length !==
    Object.keys(nextHydratedWindowsById).length;
  const nextWindowsById: StandaloneWindowSpaceWindowMap = {};

  for (const [instanceId, nextHydratedWindow] of Object.entries(
    nextHydratedWindowsById,
  )) {
    const currentWindow = currentWindowsById[instanceId];
    if (!currentWindow) {
      changed = true;
      nextWindowsById[instanceId] = nextHydratedWindow;
      continue;
    }
    const previousHydratedWindow = previousHydratedWindowsById[instanceId];
    const ownerChanged = !areStandaloneWindowOwnersEqual(
      currentWindow,
      nextHydratedWindow,
    );
    const nextWindow: StandaloneWindowSpaceWindow = ownerChanged
      ? nextHydratedWindow
      : {
          ...nextHydratedWindow,
          chatId:
            previousHydratedWindow &&
            currentWindow.chatId !== previousHydratedWindow.chatId
              ? currentWindow.chatId
              : nextHydratedWindow.chatId,
          embeddedGitPaneVisible:
            previousHydratedWindow &&
            currentWindow.embeddedGitPaneVisible !==
              previousHydratedWindow.embeddedGitPaneVisible
              ? currentWindow.embeddedGitPaneVisible
              : nextHydratedWindow.embeddedGitPaneVisible,
          zIndex:
            previousHydratedWindow &&
            currentWindow.zIndex !== previousHydratedWindow.zIndex
              ? currentWindow.zIndex
              : nextHydratedWindow.zIndex,
          bounds:
            previousHydratedWindow &&
            !areBoundsEqual(currentWindow.bounds, previousHydratedWindow.bounds)
              ? currentWindow.bounds
              : nextHydratedWindow.bounds,
        };
    if (!changed && !areStandaloneWindowsEqual(currentWindow, nextWindow)) {
      changed = true;
    }
    nextWindowsById[instanceId] = changed ? nextWindow : currentWindow;
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
  currentWindowsById: StandaloneWindowSpaceWindowMap;
  previousHydratedWindowsById: StandaloneWindowSpaceWindowMap;
  nextHydratedWindowsById: StandaloneWindowSpaceWindowMap;
  previousHydrationKey: string;
  nextHydrationKey: string;
}): {
  nextLocalWindowsById: StandaloneWindowSpaceWindowMap;
  nextPreviousHydratedWindowsById: StandaloneWindowSpaceWindowMap;
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
