import {
  buildFloatingSnapResizeBounds,
  buildFloatingSnapResizeHandles,
  denormalizeFloatingBounds,
  resolveFloatingSnapPresetFromBounds,
  type FloatingSnapPreset,
  type FloatingSnapResizeHandle,
  type FloatingWindowBoundaryInsets,
} from "components/ChatWindowing/projectChatSnapLayout";
import { buildStandaloneWindowSpaceProjectChatSurfaceId } from "components/ChatWindowing/projectChatSurfaceIds";
import { ProjectChatWindowSurface } from "components/ChatWindowing/ProjectChatWindowSurface";
import { buildProjectChatWindowTitle } from "components/ChatWindowing/projectChatWindowTitles";
import { UnifiedChatSurface } from "components/ChatWindowing/UnifiedChatSurface";
import { GitGraphWindowContent } from "components/Git/GitGraphWindowContent";
import { SectionWindowSurface } from "components/Section/Container/SectionWindowSurface";
import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { useProjectState } from "state/definitions";
import {
  ChatWindowModeEnum,
  ChatWindowPlacementEnum,
  WindowSpaceSurfaceKindEnum,
  type ChatWindowBounds,
  type ChatWindowMode,
  type WindowSpaceConfig,
} from "utils/generatedTypes";
import { shallow } from "zustand/shallow";

type StandaloneWindowSpaceWindow = {
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

type ActiveStandaloneSnapResize = {
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

const STANDALONE_WINDOW_SPACE_WINDOW_FRAME_CLASS = "rounded-none shadow-none";
const STANDALONE_WINDOW_SPACE_MIN_WIDTH_PX = 220;
const STANDALONE_WINDOW_SPACE_MIN_HEIGHT_PX = 180;
const STANDALONE_WINDOW_SPACE_RESIZE_HANDLE_HIT_SIZE_PX = 8;
const STANDALONE_WINDOW_SPACE_RESIZE_HANDLE_LINE_THICKNESS_PX = 2;
const STANDALONE_WINDOW_SPACE_RESIZE_HANDLE_LAYER_Z_INDEX = 24;

function hydrateWindowSpaceWindows(
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
      chatId: window.chatId ?? null,
      embeddedGitPaneVisible: false,
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

function focusStandaloneWindow(
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
  const nextZIndex = highestZIndex + 1;
  return {
    ...windowsById,
    [instanceId]: {
      ...current,
      zIndex: nextZIndex,
    },
  };
}

function areBoundsEqual(a: ChatWindowBounds, b: ChatWindowBounds): boolean {
  return (
    a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
  );
}

function updateStandaloneWindowBounds(
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

function setStandaloneProjectChatWindowChatId(
  windowsById: Record<string, StandaloneWindowSpaceWindow>,
  instanceId: string,
  chatId: string | null | undefined,
): Record<string, StandaloneWindowSpaceWindow> {
  const current = windowsById[instanceId];
  if (!current) {
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

function setStandaloneEmbeddedGitPaneVisibility(
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
    const nextWindow: StandaloneWindowSpaceWindow = {
      ...currentWindow,
      surfaceKind: nextHydratedWindow.surfaceKind,
      sectionIdOrNull: nextHydratedWindow.sectionIdOrNull,
      mode: nextHydratedWindow.mode,
      title: nextHydratedWindow.title,
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

export function StandaloneWindowSpaceSurface({
  windowSpace,
}: {
  windowSpace: WindowSpaceConfig;
}) {
  const containerRef = useRef<HTMLElement | null>(null);
  const projectConfigId = useProjectState((state) => state.projectConfig.id);
  const sectionNamesById = useProjectState(
    (state) =>
      Object.fromEntries(
        Object.entries(state.sections).map(([sectionId, section]) => [
          sectionId,
          section.name,
        ]),
      ),
    shallow,
  );
  const [viewportSize, setViewportSize] = useState(() => ({
    width: typeof window === "undefined" ? 1440 : window.innerWidth,
    height: typeof window === "undefined" ? 900 : window.innerHeight,
  }));

  useEffect(() => {
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const updateViewportSize = () => {
      const nextWidth = container.clientWidth;
      const nextHeight = container.clientHeight;
      if (nextWidth <= 0 || nextHeight <= 0) {
        return;
      }
      setViewportSize((current) => {
        if (current.width === nextWidth && current.height === nextHeight) {
          return current;
        }
        return {
          width: nextWidth,
          height: nextHeight,
        };
      });
    };
    updateViewportSize();
    const observer = new ResizeObserver(updateViewportSize);
    observer.observe(container);
    return () => {
      observer.disconnect();
    };
  }, []);

  const hydratedWindowsById = useMemo(
    () =>
      hydrateWindowSpaceWindows(
        windowSpace,
        viewportSize.width,
        viewportSize.height,
        sectionNamesById,
      ),
    [sectionNamesById, viewportSize.height, viewportSize.width, windowSpace],
  );
  const [localWindowsById, setLocalWindowsById] = useState(hydratedWindowsById);
  const activeSnapResizeRef = useRef<ActiveStandaloneSnapResize | null>(null);
  const previousHydratedWindowsByIdRef = useRef(hydratedWindowsById);
  const hydrationKey = `${projectConfigId}:${windowSpace.id}`;
  const previousHydrationKeyRef = useRef(hydrationKey);

  useEffect(() => {
    setLocalWindowsById((current) => {
      const result = applyStandaloneWindowSpaceHydration({
        currentWindowsById: current,
        previousHydratedWindowsById: previousHydratedWindowsByIdRef.current,
        nextHydratedWindowsById: hydratedWindowsById,
        previousHydrationKey: previousHydrationKeyRef.current,
        nextHydrationKey: hydrationKey,
      });
      previousHydratedWindowsByIdRef.current =
        result.nextPreviousHydratedWindowsById;
      previousHydrationKeyRef.current = result.nextHydrationKey;
      if (result.resetLocalState) {
        activeSnapResizeRef.current = null;
      }
      return result.nextLocalWindowsById;
    });
  }, [hydratedWindowsById, hydrationKey]);

  const visibleWindows = useMemo(() => {
    return Object.values(localWindowsById).sort((a, b) => {
      if (a.zIndex !== b.zIndex) {
        return a.zIndex - b.zIndex;
      }
      return a.instanceId.localeCompare(b.instanceId);
    });
  }, [localWindowsById]);
  const snappedWindows = useMemo(() => {
    return visibleWindows.flatMap((window) => {
      const snapPreset = resolveFloatingSnapPresetFromBounds(
        window.bounds,
        viewportSize.width,
        viewportSize.height,
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
  }, [viewportSize.height, viewportSize.width, visibleWindows]);
  const snapResizeHandles = useMemo(
    () => buildFloatingSnapResizeHandles(snappedWindows),
    [snappedWindows],
  );

  const handleSnapResizePointerDown = (
    event: PointerEvent<HTMLDivElement>,
    handle: FloatingSnapResizeHandle,
  ) => {
    if (event.button !== 0) {
      return;
    }
    const startBoundsByInstanceId: Record<string, ChatWindowBounds> = {};
    const involvedInstanceIds = [
      ...handle.leadingInstanceIds,
      ...handle.trailingInstanceIds,
    ];
    for (const instanceId of involvedInstanceIds) {
      const bounds = localWindowsById[instanceId]?.bounds;
      if (!bounds) {
        return;
      }
      startBoundsByInstanceId[instanceId] = { ...bounds };
    }

    if (handle.axis === "vertical") {
      let minCoordinate = -Infinity;
      let maxCoordinate = Infinity;
      for (const instanceId of handle.leadingInstanceIds) {
        const bounds = startBoundsByInstanceId[instanceId];
        if (!bounds) {
          return;
        }
        minCoordinate = Math.max(
          minCoordinate,
          bounds.x + STANDALONE_WINDOW_SPACE_MIN_WIDTH_PX,
        );
      }
      for (const instanceId of handle.trailingInstanceIds) {
        const bounds = startBoundsByInstanceId[instanceId];
        if (!bounds) {
          return;
        }
        maxCoordinate = Math.min(
          maxCoordinate,
          bounds.x + bounds.width - STANDALONE_WINDOW_SPACE_MIN_WIDTH_PX,
        );
      }
      activeSnapResizeRef.current = {
        pointerId: event.pointerId,
        axis: "vertical",
        startPointerPosition: event.clientX,
        startCoordinate: handle.coordinate,
        minCoordinate,
        maxCoordinate,
        leadingInstanceIds: handle.leadingInstanceIds,
        trailingInstanceIds: handle.trailingInstanceIds,
        startBoundsByInstanceId,
      };
    } else {
      let minCoordinate = -Infinity;
      let maxCoordinate = Infinity;
      for (const instanceId of handle.leadingInstanceIds) {
        const bounds = startBoundsByInstanceId[instanceId];
        if (!bounds) {
          return;
        }
        minCoordinate = Math.max(
          minCoordinate,
          bounds.y + STANDALONE_WINDOW_SPACE_MIN_HEIGHT_PX,
        );
      }
      for (const instanceId of handle.trailingInstanceIds) {
        const bounds = startBoundsByInstanceId[instanceId];
        if (!bounds) {
          return;
        }
        maxCoordinate = Math.min(
          maxCoordinate,
          bounds.y + bounds.height - STANDALONE_WINDOW_SPACE_MIN_HEIGHT_PX,
        );
      }
      activeSnapResizeRef.current = {
        pointerId: event.pointerId,
        axis: "horizontal",
        startPointerPosition: event.clientY,
        startCoordinate: handle.coordinate,
        minCoordinate,
        maxCoordinate,
        leadingInstanceIds: handle.leadingInstanceIds,
        trailingInstanceIds: handle.trailingInstanceIds,
        startBoundsByInstanceId,
      };
    }
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleSnapResizePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const activeResize = activeSnapResizeRef.current;
    if (!activeResize || activeResize.pointerId !== event.pointerId) {
      return;
    }
    const pointerPosition =
      activeResize.axis === "vertical" ? event.clientX : event.clientY;
    const unclampedCoordinate =
      activeResize.startCoordinate +
      (pointerPosition - activeResize.startPointerPosition);
    const nextCoordinate = Math.min(
      Math.max(unclampedCoordinate, activeResize.minCoordinate),
      activeResize.maxCoordinate,
    );
    const nextBoundsByInstanceId = buildFloatingSnapResizeBounds(
      {
        axis: activeResize.axis,
        coordinate: activeResize.startCoordinate,
        leadingInstanceIds: activeResize.leadingInstanceIds,
        trailingInstanceIds: activeResize.trailingInstanceIds,
        startBoundsByInstanceId: activeResize.startBoundsByInstanceId,
      },
      nextCoordinate,
    );
    setLocalWindowsById((current) =>
      updateStandaloneWindowBounds(current, nextBoundsByInstanceId),
    );
  };

  const handleSnapResizePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const activeResize = activeSnapResizeRef.current;
    if (!activeResize || activeResize.pointerId !== event.pointerId) {
      return;
    }
    activeSnapResizeRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <section
      ref={containerRef}
      className="relative flex min-h-0 flex-1 overflow-hidden bg-setta-100/80 dark:bg-setta-950"
      data-testid="standalone-window-space-surface"
    >
      {visibleWindows.length === 0 ? (
        <div className="m-auto rounded-lg border border-dashed border-setta-300 bg-white/80 px-4 py-3 text-sm text-setta-600 dark:border-setta-800 dark:bg-setta-900/80 dark:text-setta-300">
          This window space does not have any saved floating windows.
        </div>
      ) : null}
      {visibleWindows.map((window) => (
        <article
          key={window.instanceId}
          className={`absolute flex min-h-0 min-w-0 flex-col overflow-hidden ${STANDALONE_WINDOW_SPACE_WINDOW_FRAME_CLASS}`}
          style={{
            left: window.bounds.x,
            top: window.bounds.y,
            width: window.bounds.width,
            height: window.bounds.height,
            zIndex: window.zIndex,
          }}
          data-testid="standalone-window-space-window"
          data-chat-window-instance-id={window.instanceId}
          data-window-space-surface-kind={window.surfaceKind}
          onPointerDown={() => {
            setLocalWindowsById((current) =>
              focusStandaloneWindow(current, window.instanceId),
            );
          }}
        >
          {window.surfaceKind === WindowSpaceSurfaceKindEnum.section &&
          window.sectionIdOrNull ? (
            <SectionWindowSurface
              sectionId={window.sectionIdOrNull}
              headerActions={null}
              roundedClassName="rounded-none"
              chatHost={ChatWindowPlacementEnum.floating}
              chatModeOverride={window.mode}
              projectChatSurfaceId={buildStandaloneWindowSpaceProjectChatSurfaceId(
                projectConfigId,
                windowSpace.id,
                window.instanceId,
              )}
              projectChatId={window.chatId}
              setProjectChatId={(next) => {
                const resolvedChatId =
                  typeof next === "function"
                    ? next(window.chatId ?? undefined)
                    : next;
                setLocalWindowsById((current) =>
                  setStandaloneProjectChatWindowChatId(
                    current,
                    window.instanceId,
                    resolvedChatId,
                  ),
                );
              }}
              headerProps={{
                onPointerDown: () => {
                  setLocalWindowsById((current) =>
                    focusStandaloneWindow(current, window.instanceId),
                  );
                },
              }}
            />
          ) : (
            <ProjectChatWindowSurface
              title={window.title}
              mode={window.mode}
              instanceId={window.instanceId}
              roundedClassName="rounded-none"
              actions={[]}
              onTitleClick={() => {
                setLocalWindowsById((current) =>
                  focusStandaloneWindow(current, window.instanceId),
                );
              }}
            >
              {window.mode === ChatWindowModeEnum.git_graph_mode ? (
                <GitGraphWindowContent
                  instanceId={window.instanceId}
                  showEmbeddedGitPaneToggle
                  embeddedGitPaneVisible={window.embeddedGitPaneVisible}
                  onEmbeddedGitPaneVisibleChange={(visible) => {
                    setLocalWindowsById((current) =>
                      setStandaloneEmbeddedGitPaneVisibility(
                        current,
                        window.instanceId,
                        visible,
                      ),
                    );
                  }}
                />
              ) : (
                <UnifiedChatSurface
                  mode={window.mode}
                  host={ChatWindowPlacementEnum.floating}
                  surfaceId={buildStandaloneWindowSpaceProjectChatSurfaceId(
                    projectConfigId,
                    windowSpace.id,
                    window.instanceId,
                  )}
                  projectChatId={window.chatId}
                  setProjectChatId={(next) => {
                    const resolvedChatId =
                      typeof next === "function"
                        ? next(window.chatId ?? undefined)
                        : next;
                    setLocalWindowsById((current) =>
                      setStandaloneProjectChatWindowChatId(
                        current,
                        window.instanceId,
                        resolvedChatId,
                      ),
                    );
                  }}
                />
              )}
            </ProjectChatWindowSurface>
          )}
        </article>
      ))}
      {snapResizeHandles.length > 0 ? (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            zIndex: STANDALONE_WINDOW_SPACE_RESIZE_HANDLE_LAYER_Z_INDEX,
          }}
        >
          {snapResizeHandles.map((handle) => {
            const handleLengthPx = Math.max(
              0,
              handle.end -
                handle.start -
                STANDALONE_WINDOW_SPACE_RESIZE_HANDLE_HIT_SIZE_PX,
            );
            return (
              <div
                key={`${handle.axis}-${handle.leadingInstanceIds.join("|")}-${handle.trailingInstanceIds.join("|")}`}
                role="separator"
                aria-orientation={
                  handle.axis === "vertical" ? "vertical" : "horizontal"
                }
                className={`pointer-events-auto absolute flex items-center justify-center ${
                  handle.axis === "vertical"
                    ? "cursor-col-resize"
                    : "cursor-row-resize"
                }`}
                style={
                  handle.axis === "vertical"
                    ? {
                        left:
                          handle.coordinate -
                          STANDALONE_WINDOW_SPACE_RESIZE_HANDLE_HIT_SIZE_PX / 2,
                        top: handle.start,
                        width:
                          STANDALONE_WINDOW_SPACE_RESIZE_HANDLE_HIT_SIZE_PX,
                        height: Math.max(
                          STANDALONE_WINDOW_SPACE_RESIZE_HANDLE_HIT_SIZE_PX,
                          handleLengthPx +
                            STANDALONE_WINDOW_SPACE_RESIZE_HANDLE_HIT_SIZE_PX,
                        ),
                      }
                    : {
                        left: handle.start,
                        top:
                          handle.coordinate -
                          STANDALONE_WINDOW_SPACE_RESIZE_HANDLE_HIT_SIZE_PX / 2,
                        width: Math.max(
                          STANDALONE_WINDOW_SPACE_RESIZE_HANDLE_HIT_SIZE_PX,
                          handleLengthPx +
                            STANDALONE_WINDOW_SPACE_RESIZE_HANDLE_HIT_SIZE_PX,
                        ),
                        height:
                          STANDALONE_WINDOW_SPACE_RESIZE_HANDLE_HIT_SIZE_PX,
                      }
                }
                onPointerDown={(event) => {
                  handleSnapResizePointerDown(event, handle);
                }}
                onPointerMove={handleSnapResizePointerMove}
                onPointerUp={handleSnapResizePointerUp}
                data-testid="standalone-window-space-resize-handle"
                data-resize-axis={handle.axis}
              >
                <div
                  className="rounded-full bg-setta-300/80 transition-colors hover:bg-blue-500 dark:bg-setta-600/80 dark:hover:bg-blue-400"
                  style={
                    handle.axis === "vertical"
                      ? {
                          width:
                            STANDALONE_WINDOW_SPACE_RESIZE_HANDLE_LINE_THICKNESS_PX,
                          height: Math.max(24, handle.end - handle.start - 8),
                        }
                      : {
                          width: Math.max(24, handle.end - handle.start - 8),
                          height:
                            STANDALONE_WINDOW_SPACE_RESIZE_HANDLE_LINE_THICKNESS_PX,
                        }
                  }
                />
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
