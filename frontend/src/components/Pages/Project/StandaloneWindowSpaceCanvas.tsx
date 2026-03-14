import { type FloatingSnapResizeHandle } from "components/ChatWindowing/projectChatSnapLayout";
import { type PointerEvent } from "react";
import { NotFound } from "../NotFound/NotFound";
import { type StandaloneWindowSpaceWindow } from "./standaloneWindowSpaceState";
import { StandaloneWindowSpaceWindowSurface } from "./StandaloneWindowSpaceWindowSurface";

const STANDALONE_WINDOW_SPACE_RESIZE_HANDLE_HIT_SIZE_PX = 8;
const STANDALONE_WINDOW_SPACE_RESIZE_HANDLE_LINE_THICKNESS_PX = 2;
const STANDALONE_WINDOW_SPACE_RESIZE_HANDLE_LAYER_Z_INDEX = 24;

export function StandaloneWindowSpaceCanvas({
  visibleWindows,
  shouldShowManagedChatBlockedSurface,
  projectConfigId,
  windowSpaceId,
  snapResizeHandles,
  onFocusWindow,
  onProjectChatIdChange,
  onEmbeddedGitPaneVisibleChange,
  onBlockedErrorCodeChange,
  onSnapResizePointerDown,
  onSnapResizePointerMove,
  onSnapResizePointerUp,
}: {
  visibleWindows: StandaloneWindowSpaceWindow[];
  shouldShowManagedChatBlockedSurface: boolean;
  projectConfigId: string;
  windowSpaceId: string;
  snapResizeHandles: FloatingSnapResizeHandle[];
  onFocusWindow: (instanceId: string) => void;
  onProjectChatIdChange: (
    instanceId: string,
    chatId: string | null | undefined,
  ) => void;
  onEmbeddedGitPaneVisibleChange: (
    instanceId: string,
    visible: boolean,
  ) => void;
  onBlockedErrorCodeChange: (
    instanceId: string,
    errorCode: string | null,
  ) => void;
  onSnapResizePointerDown: (
    event: PointerEvent<HTMLDivElement>,
    handle: FloatingSnapResizeHandle,
  ) => void;
  onSnapResizePointerMove: (event: PointerEvent<HTMLDivElement>) => void;
  onSnapResizePointerUp: (event: PointerEvent<HTMLDivElement>) => void;
}) {
  return (
    <>
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
        <StandaloneWindowSpaceWindowSurface
          key={window.instanceId}
          window={window}
          projectConfigId={projectConfigId}
          windowSpaceId={windowSpaceId}
          onFocusWindow={() => {
            onFocusWindow(window.instanceId);
          }}
          onProjectChatIdChange={(chatId) => {
            onProjectChatIdChange(window.instanceId, chatId);
          }}
          onEmbeddedGitPaneVisibleChange={(visible) => {
            onEmbeddedGitPaneVisibleChange(window.instanceId, visible);
          }}
          onBlockedErrorCodeChange={(errorCode) => {
            onBlockedErrorCodeChange(window.instanceId, errorCode);
          }}
        />
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
    </>
  );
}
