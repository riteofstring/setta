import {
  windowSurfaceRequiresManagedChat,
  type ManagedChatSurfaceAuthorityState,
} from "components/Chat/sharePolicyChatAccess";
import {
  buildFloatingSnapResizeBounds,
  buildFloatingSnapResizeHandles,
  denormalizeFloatingBounds,
  resolveFloatingSnapPresetFromBounds,
  type FloatingSnapPreset,
  type FloatingSnapResizeHandle,
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

type SnappedStandaloneWindow = {
  instanceId: string;
  bounds: ChatWindowBounds;
  snapPreset: FloatingSnapPreset;
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

const EMPTY_FLOATING_WINDOW_INSETS: FloatingWindowBoundaryInsets = {
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
};

const STANDALONE_WINDOW_SPACE_MIN_WIDTH_PX = 220;
const STANDALONE_WINDOW_SPACE_MIN_HEIGHT_PX = 180;

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
): Record<string, StandaloneWindowSpaceWindow> {
  const hydratedWindowsById: Record<string, StandaloneWindowSpaceWindow> = {};
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
  windowsById: Record<string, StandaloneWindowSpaceWindow>,
  instanceId: string,
): Record<string, StandaloneWindowSpaceWindow> {
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
  windowsById: Record<string, StandaloneWindowSpaceWindow>,
  nextBoundsByInstanceId: Record<string, ChatWindowBounds>,
): Record<string, StandaloneWindowSpaceWindow> {
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
  windowsById: Record<string, StandaloneWindowSpaceWindow>,
  instanceId: string,
  chatId: string | null | undefined,
): Record<string, StandaloneWindowSpaceWindow> {
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
  windowsById: Record<string, StandaloneWindowSpaceWindow>,
  instanceId: string,
  visible: boolean,
): Record<string, StandaloneWindowSpaceWindow> {
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
    const previousHydratedWindow = previousHydratedWindowsById[instanceId];
    const ownerChanged = !areStandaloneWindowOwnersEqual(
      currentWindow,
      nextHydratedWindow,
    );
    const nextWindow: StandaloneWindowSpaceWindow = ownerChanged
      ? nextHydratedWindow
      : {
          ...nextHydratedWindow,
          title: nextHydratedWindow.title,
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

export function clearStandaloneBlockedManagedWindowIds(
  currentBlockedWindowIds: Record<string, true>,
): Record<string, true> {
  if (Object.keys(currentBlockedWindowIds).length === 0) {
    return currentBlockedWindowIds;
  }
  return {};
}

export function reconcileStandaloneBlockedManagedWindowIds({
  currentBlockedWindowIds,
  localWindowsById,
  managedChatAuthorityState,
}: {
  currentBlockedWindowIds: Record<string, true>;
  localWindowsById: Record<string, StandaloneWindowSpaceWindow>;
  managedChatAuthorityState: ManagedChatSurfaceAuthorityState;
}): Record<string, true> {
  const next: Record<string, true> = {};
  let changed = false;
  for (const instanceId of Object.keys(currentBlockedWindowIds)) {
    const window = localWindowsById[instanceId];
    if (
      window &&
      windowSurfaceRequiresManagedChat(window, managedChatAuthorityState)
    ) {
      next[instanceId] = true;
      continue;
    }
    changed = true;
  }
  if (
    !changed &&
    Object.keys(currentBlockedWindowIds).length === Object.keys(next).length
  ) {
    return currentBlockedWindowIds;
  }
  return next;
}

export function applyStandaloneBlockedManagedWindowErrorCode({
  currentBlockedWindowIds,
  instanceId,
  errorCode,
}: {
  currentBlockedWindowIds: Record<string, true>;
  instanceId: string;
  errorCode: string | null;
}): Record<string, true> {
  const shouldBlock = errorCode === "llm_disallowed";
  if (shouldBlock) {
    if (currentBlockedWindowIds[instanceId]) {
      return currentBlockedWindowIds;
    }
    return {
      ...currentBlockedWindowIds,
      [instanceId]: true,
    };
  }
  if (!currentBlockedWindowIds[instanceId]) {
    return currentBlockedWindowIds;
  }
  const next = { ...currentBlockedWindowIds };
  delete next[instanceId];
  return next;
}

export function buildVisibleStandaloneWindows({
  localWindowsById,
  blockedManagedWindowIds,
  canUseManagedChat,
  managedChatAuthorityState,
}: {
  localWindowsById: Record<string, StandaloneWindowSpaceWindow>;
  blockedManagedWindowIds: Record<string, true>;
  canUseManagedChat: boolean;
  managedChatAuthorityState: ManagedChatSurfaceAuthorityState;
}): StandaloneWindowSpaceWindow[] {
  return Object.values(localWindowsById)
    .filter((window) => {
      if (
        !canUseManagedChat &&
        windowSurfaceRequiresManagedChat(window, managedChatAuthorityState)
      ) {
        return false;
      }
      return !blockedManagedWindowIds[window.instanceId];
    })
    .sort((a, b) => {
      if (a.zIndex !== b.zIndex) {
        return a.zIndex - b.zIndex;
      }
      return a.instanceId.localeCompare(b.instanceId);
    });
}

export function hasStandaloneManagedWindows(
  localWindowsById: Record<string, StandaloneWindowSpaceWindow>,
  managedChatAuthorityState: ManagedChatSurfaceAuthorityState,
): boolean {
  return Object.values(localWindowsById).some((window) =>
    windowSurfaceRequiresManagedChat(window, managedChatAuthorityState),
  );
}

export function buildStandaloneWindowSpaceResizeHandles({
  visibleWindows,
  viewportWidthPx,
  viewportHeightPx,
}: {
  visibleWindows: StandaloneWindowSpaceWindow[];
  viewportWidthPx: number;
  viewportHeightPx: number;
}): FloatingSnapResizeHandle[] {
  const snappedWindows = visibleWindows.flatMap((window) => {
    const snapPreset = resolveFloatingSnapPresetFromBounds(
      window.bounds,
      viewportWidthPx,
      viewportHeightPx,
      EMPTY_FLOATING_WINDOW_INSETS,
    );
    if (!snapPreset) {
      return [];
    }
    return [
      {
        instanceId: window.instanceId,
        bounds: window.bounds,
        snapPreset,
      } satisfies SnappedStandaloneWindow,
    ];
  });
  return buildFloatingSnapResizeHandles(snappedWindows);
}

export function beginStandaloneSnapResize({
  handle,
  pointerId,
  pointerPosition,
  windowsById,
}: {
  handle: FloatingSnapResizeHandle;
  pointerId: number;
  pointerPosition: number;
  windowsById: Record<string, StandaloneWindowSpaceWindow>;
}): ActiveStandaloneSnapResize | null {
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

  if (handle.axis === "vertical") {
    let minCoordinate = -Infinity;
    let maxCoordinate = Infinity;
    for (const instanceId of handle.leadingInstanceIds) {
      const bounds = startBoundsByInstanceId[instanceId];
      if (!bounds) {
        return null;
      }
      minCoordinate = Math.max(
        minCoordinate,
        bounds.x + STANDALONE_WINDOW_SPACE_MIN_WIDTH_PX,
      );
    }
    for (const instanceId of handle.trailingInstanceIds) {
      const bounds = startBoundsByInstanceId[instanceId];
      if (!bounds) {
        return null;
      }
      maxCoordinate = Math.min(
        maxCoordinate,
        bounds.x + bounds.width - STANDALONE_WINDOW_SPACE_MIN_WIDTH_PX,
      );
    }
    return {
      pointerId,
      axis: "vertical",
      startPointerPosition: pointerPosition,
      startCoordinate: handle.coordinate,
      minCoordinate,
      maxCoordinate,
      leadingInstanceIds: handle.leadingInstanceIds,
      trailingInstanceIds: handle.trailingInstanceIds,
      startBoundsByInstanceId,
    };
  }

  let minCoordinate = -Infinity;
  let maxCoordinate = Infinity;
  for (const instanceId of handle.leadingInstanceIds) {
    const bounds = startBoundsByInstanceId[instanceId];
    if (!bounds) {
      return null;
    }
    minCoordinate = Math.max(
      minCoordinate,
      bounds.y + STANDALONE_WINDOW_SPACE_MIN_HEIGHT_PX,
    );
  }
  for (const instanceId of handle.trailingInstanceIds) {
    const bounds = startBoundsByInstanceId[instanceId];
    if (!bounds) {
      return null;
    }
    maxCoordinate = Math.min(
      maxCoordinate,
      bounds.y + bounds.height - STANDALONE_WINDOW_SPACE_MIN_HEIGHT_PX,
    );
  }
  return {
    pointerId,
    axis: "horizontal",
    startPointerPosition: pointerPosition,
    startCoordinate: handle.coordinate,
    minCoordinate,
    maxCoordinate,
    leadingInstanceIds: handle.leadingInstanceIds,
    trailingInstanceIds: handle.trailingInstanceIds,
    startBoundsByInstanceId,
  };
}

export function buildStandaloneSnapResizeNextBounds({
  activeResize,
  pointerPosition,
}: {
  activeResize: ActiveStandaloneSnapResize;
  pointerPosition: number;
}): Record<string, ChatWindowBounds> {
  const unclampedCoordinate =
    activeResize.startCoordinate +
    (pointerPosition - activeResize.startPointerPosition);
  const nextCoordinate = Math.min(
    Math.max(unclampedCoordinate, activeResize.minCoordinate),
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
