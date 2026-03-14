import { type ManagedChatSurfaceAuthorityState } from "components/Chat/sharePolicyChatAccess";
import { type FloatingSnapResizeHandle } from "components/ChatWindowing/projectChatSnapLayout";
import { buildStandaloneWindowSpaceProjectChatSurfaceId } from "components/ChatWindowing/projectChatSurfaceIds";
import { ProjectChatWindowSurface } from "components/ChatWindowing/ProjectChatWindowSurface";
import { UnifiedChatSurface } from "components/ChatWindowing/UnifiedChatSurface";
import { GitGraphWindowContent } from "components/Git/GitGraphWindowContent";
import { SectionWindowSurface } from "components/Section/Container/SectionWindowSurface";
import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { useProjectState } from "state/definitions";
import {
  ChatWindowModeEnum,
  ChatWindowPlacementEnum,
  WindowSpaceSurfaceKindEnum,
  type WindowSpaceConfig,
} from "utils/generatedTypes";
import { shallow } from "zustand/shallow";
import { NotFound } from "../NotFound/NotFound";
import {
  applyStandaloneBlockedManagedWindowErrorCode,
  applyStandaloneWindowSpaceHydration,
  beginStandaloneSnapResize,
  buildStandaloneSnapResizeNextBounds,
  buildStandaloneWindowSpaceResizeHandles,
  buildVisibleStandaloneWindows,
  canControlStandaloneWindowChatId,
  clearStandaloneBlockedManagedWindowIds,
  focusStandaloneWindow,
  hasStandaloneManagedWindows,
  hydrateWindowSpaceWindows,
  reconcileStandaloneBlockedManagedWindowIds,
  setStandaloneEmbeddedGitPaneVisibility,
  setStandaloneProjectChatWindowChatId,
  updateStandaloneWindowBounds,
  type ActiveStandaloneSnapResize,
} from "./standaloneWindowSpaceState";

const STANDALONE_WINDOW_SPACE_WINDOW_FRAME_CLASS = "rounded-none shadow-none";
const STANDALONE_WINDOW_SPACE_RESIZE_HANDLE_HIT_SIZE_PX = 8;
const STANDALONE_WINDOW_SPACE_RESIZE_HANDLE_LINE_THICKNESS_PX = 2;
const STANDALONE_WINDOW_SPACE_RESIZE_HANDLE_LAYER_Z_INDEX = 24;

export function StandaloneWindowSpaceSurface({
  windowSpace,
  canUseManagedChat,
  managedChatAuthorityState,
}: {
  windowSpace: WindowSpaceConfig;
  canUseManagedChat: boolean;
  managedChatAuthorityState: ManagedChatSurfaceAuthorityState;
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
  const [blockedManagedWindowIds, setBlockedManagedWindowIds] = useState<
    Record<string, true>
  >({});
  const activeSnapResizeRef = useRef<ActiveStandaloneSnapResize | null>(null);
  const previousHydratedWindowsByIdRef = useRef(hydratedWindowsById);
  const hydrationKey = `${projectConfigId}:${windowSpace.id}`;
  const previousHydrationKeyRef = useRef(hydrationKey);
  const previousCanUseManagedChatRef = useRef(canUseManagedChat);

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

  useEffect(() => {
    setBlockedManagedWindowIds(clearStandaloneBlockedManagedWindowIds);
  }, [hydrationKey]);

  useEffect(() => {
    setBlockedManagedWindowIds((current) =>
      reconcileStandaloneBlockedManagedWindowIds({
        currentBlockedWindowIds: current,
        localWindowsById,
        managedChatAuthorityState,
      }),
    );
  }, [localWindowsById, managedChatAuthorityState]);

  useEffect(() => {
    if (!previousCanUseManagedChatRef.current && canUseManagedChat) {
      setBlockedManagedWindowIds(clearStandaloneBlockedManagedWindowIds);
    }
    previousCanUseManagedChatRef.current = canUseManagedChat;
  }, [canUseManagedChat]);

  const visibleWindows = useMemo(
    () =>
      buildVisibleStandaloneWindows({
        localWindowsById,
        blockedManagedWindowIds,
        canUseManagedChat,
        managedChatAuthorityState,
      }),
    [
      blockedManagedWindowIds,
      canUseManagedChat,
      localWindowsById,
      managedChatAuthorityState,
    ],
  );
  const hasManagedWindows = useMemo(
    () =>
      hasStandaloneManagedWindows(localWindowsById, managedChatAuthorityState),
    [localWindowsById, managedChatAuthorityState],
  );
  const shouldShowManagedChatBlockedSurface =
    visibleWindows.length === 0 && hasManagedWindows;
  const setWindowBlockedErrorCode = (
    instanceId: string,
    errorCode: string | null,
  ) => {
    setBlockedManagedWindowIds((current) =>
      applyStandaloneBlockedManagedWindowErrorCode({
        currentBlockedWindowIds: current,
        instanceId,
        errorCode,
      }),
    );
  };
  const snapResizeHandles = useMemo(
    () =>
      buildStandaloneWindowSpaceResizeHandles({
        visibleWindows,
        viewportWidthPx: viewportSize.width,
        viewportHeightPx: viewportSize.height,
      }),
    [viewportSize.height, viewportSize.width, visibleWindows],
  );

  const handleSnapResizePointerDown = (
    event: PointerEvent<HTMLDivElement>,
    handle: FloatingSnapResizeHandle,
  ) => {
    if (event.button !== 0) {
      return;
    }
    const pointerPosition =
      handle.axis === "vertical" ? event.clientX : event.clientY;
    const activeResize = beginStandaloneSnapResize({
      handle,
      pointerId: event.pointerId,
      pointerPosition,
      windowsById: localWindowsById,
    });
    if (!activeResize) {
      return;
    }
    activeSnapResizeRef.current = activeResize;
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
    setLocalWindowsById((current) =>
      updateStandaloneWindowBounds(
        current,
        buildStandaloneSnapResizeNextBounds({
          activeResize,
          pointerPosition,
        }),
      ),
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
      {shouldShowManagedChatBlockedSurface ? (
        <div
          className="relative min-h-0 flex-1"
          data-testid="standalone-managed-chat-blocked"
        >
          <NotFound
            title="Managed Chat Unavailable"
            description="This deployment does not allow LLM access for standalone managed chat surfaces."
          />
        </div>
      ) : null}
      {visibleWindows.length === 0 && !shouldShowManagedChatBlockedSurface ? (
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
              projectChatId={
                canControlStandaloneWindowChatId(window)
                  ? window.chatId
                  : undefined
              }
              setProjectChatId={
                canControlStandaloneWindowChatId(window)
                  ? (next) => {
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
                    }
                  : undefined
              }
              headerProps={{
                onPointerDown: () => {
                  setLocalWindowsById((current) =>
                    focusStandaloneWindow(current, window.instanceId),
                  );
                },
              }}
              onProjectChatBlockedErrorCodeChange={(errorCode) => {
                setWindowBlockedErrorCode(window.instanceId, errorCode);
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
                  key={`${buildStandaloneWindowSpaceProjectChatSurfaceId(
                    projectConfigId,
                    windowSpace.id,
                    window.instanceId,
                  )}:${window.chatId ?? "global"}`}
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
                  onProjectChatBlockedErrorCodeChange={(errorCode) => {
                    setWindowBlockedErrorCode(window.instanceId, errorCode);
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
