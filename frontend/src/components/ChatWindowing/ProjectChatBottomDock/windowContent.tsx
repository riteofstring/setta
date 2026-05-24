import { buildWorkspaceProjectChatWindowSurfaceId } from "components/ChatWindowing/projectChatSurfaceIds";
import { UnifiedChatSurface } from "components/ChatWindowing/UnifiedChatSurface";
import { GitGraphWindowContent } from "components/Git/GitGraphWindowContent";
import { type PointerEvent } from "react";
import { setProjectChatWindowChatId } from "state/actions/projectChatWindowing";
import { ChatWindowModeEnum } from "utils/generatedTypes";

import {
  DOCK_WINDOW_RESIZE_HANDLES,
  FLOATING_WINDOW_RESIZE_HANDLES,
  ResolvedWindowPill,
  WindowResizeDirection,
} from "./shared";

type ProjectChatWindowContentProps = {
  pill: ResolvedWindowPill;
  projectConfigId: string;
  host: ResolvedWindowPill["placement"];
  showEmbeddedGitPaneToggle?: boolean;
};

export function ProjectChatWindowContent({
  pill,
  projectConfigId,
  host,
  showEmbeddedGitPaneToggle = true,
}: ProjectChatWindowContentProps) {
  if (pill.mode === ChatWindowModeEnum.git_graph_mode) {
    return (
      <GitGraphWindowContent
        instanceId={pill.instanceId}
        showEmbeddedGitPaneToggle={showEmbeddedGitPaneToggle}
      />
    );
  }
  return (
    <UnifiedChatSurface
      mode={pill.mode}
      host={host}
      surfaceId={buildWorkspaceProjectChatWindowSurfaceId(
        projectConfigId,
        pill.instanceId,
      )}
      projectChatId={pill.chatId}
      setProjectChatId={(next) => {
        const resolvedChatId =
          typeof next === "function" ? next(pill.chatId ?? undefined) : next;
        setProjectChatWindowChatId(pill.instanceId, resolvedChatId);
      }}
    />
  );
}

type DockedWindowResizeHandlesProps = {
  pill: ResolvedWindowPill;
  onPointerDown: (
    event: PointerEvent<HTMLDivElement>,
    pill: ResolvedWindowPill,
    direction: WindowResizeDirection,
  ) => void;
  onPointerMove: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLDivElement>) => void;
};

export function DockedWindowResizeHandles({
  pill,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: DockedWindowResizeHandlesProps) {
  return DOCK_WINDOW_RESIZE_HANDLES.map((handle) => (
    <div
      key={`${pill.instanceId}-${handle.direction}`}
      role="separator"
      aria-orientation={
        handle.direction === "top" || handle.direction === "bottom"
          ? "horizontal"
          : "vertical"
      }
      className={`group/resize absolute z-10 flex items-center justify-center ${handle.className} ${handle.cursorClassName}`}
      data-testid="project-chat-bottom-dock-resize-handle"
      data-resize-direction={handle.direction}
      onPointerDown={(event) => {
        onPointerDown(event, pill, handle.direction);
      }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {handle.indicatorClassName ? (
        <div className={handle.indicatorClassName} />
      ) : null}
    </div>
  ));
}

type FloatingWindowResizeHandlesProps = {
  pill: ResolvedWindowPill;
  onPointerDown: (
    event: PointerEvent<HTMLDivElement>,
    pill: ResolvedWindowPill,
    direction: WindowResizeDirection,
  ) => void;
  onPointerMove: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLDivElement>) => void;
};

export function FloatingWindowResizeHandles({
  pill,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: FloatingWindowResizeHandlesProps) {
  return FLOATING_WINDOW_RESIZE_HANDLES.map((handle) => (
    <div
      key={`${pill.instanceId}-floating-${handle.direction}`}
      role="separator"
      aria-orientation={
        handle.direction === "top" || handle.direction === "bottom"
          ? "horizontal"
          : "vertical"
      }
      className={`absolute z-10 flex items-center justify-center ${handle.className} ${handle.cursorClassName}`}
      onPointerDown={(event) => {
        onPointerDown(event, pill, handle.direction);
      }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      data-testid="project-chat-floating-window-resize-handle"
      data-resize-direction={handle.direction}
      data-chat-window-instance-id={pill.instanceId}
    >
      {handle.indicatorClassName ? (
        <div className={handle.indicatorClassName} />
      ) : null}
    </div>
  ));
}
