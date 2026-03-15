import { type ManagedChatSurfaceAuthorityState } from "components/Chat/sharePolicyChatAccess";
import { buildStandaloneWindowSpaceProjectChatSurfaceId } from "components/ChatWindowing/projectChatSurfaceIds";
import { ProjectChatWindowSurface } from "components/ChatWindowing/ProjectChatWindowSurface";
import { UnifiedChatSurface } from "components/ChatWindowing/UnifiedChatSurface";
import { GitGraphWindowContent } from "components/Git/GitGraphWindowContent";
import { SectionWindowSurface } from "components/Section/Container/SectionWindowSurface";
import { useEffect, useMemo, useRef, useState } from "react";
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
  canControlStandaloneWindowChatId,
  hydrateWindowSpaceWindows,
} from "./standaloneWindowSpaceWindowModel";
import { useStandaloneWindowSpaceWindowSession } from "./useStandaloneWindowSpaceWindowSession";

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
  const {
    focusWindow,
    onSnapResizePointerDown,
    onSnapResizePointerMove,
    onSnapResizePointerUp,
    setEmbeddedGitPaneVisible,
    setProjectChatWindowChatId,
    setWindowBlockedErrorCode,
    shouldShowManagedChatBlockedSurface,
    snapResizeHandles,
    visibleWindows,
  } = useStandaloneWindowSpaceWindowSession({
    canUseManagedChat,
    hydratedWindowsById,
    managedChatAuthorityState,
    projectConfigId,
    viewportSize,
    windowSpaceId: windowSpace.id,
  });

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
      {visibleWindows.map((window) => {
        const projectChatSurfaceId =
          buildStandaloneWindowSpaceProjectChatSurfaceId(
            projectConfigId,
            windowSpace.id,
            window.instanceId,
          );
        return (
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
              focusWindow(window.instanceId);
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
                projectChatSurfaceId={projectChatSurfaceId}
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
                        setProjectChatWindowChatId(
                          window.instanceId,
                          resolvedChatId,
                        );
                      }
                    : undefined
                }
                headerProps={{
                  onPointerDown: () => {
                    focusWindow(window.instanceId);
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
                  focusWindow(window.instanceId);
                }}
              >
                {window.mode === ChatWindowModeEnum.git_graph_mode ? (
                  <GitGraphWindowContent
                    instanceId={window.instanceId}
                    showEmbeddedGitPaneToggle
                    embeddedGitPaneVisible={window.embeddedGitPaneVisible}
                    onEmbeddedGitPaneVisibleChange={(visible) => {
                      setEmbeddedGitPaneVisible(window.instanceId, visible);
                    }}
                  />
                ) : (
                  <UnifiedChatSurface
                    key={`${projectChatSurfaceId}:${window.chatId ?? "global"}`}
                    mode={window.mode}
                    host={ChatWindowPlacementEnum.floating}
                    surfaceId={projectChatSurfaceId}
                    projectChatId={window.chatId}
                    setProjectChatId={(next) => {
                      const resolvedChatId =
                        typeof next === "function"
                          ? next(window.chatId ?? undefined)
                          : next;
                      setProjectChatWindowChatId(
                        window.instanceId,
                        resolvedChatId,
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
        );
      })}
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
                  onSnapResizePointerDown(event, handle);
                }}
                onPointerMove={onSnapResizePointerMove}
                onPointerUp={onSnapResizePointerUp}
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
