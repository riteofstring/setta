import { buildStandaloneWindowSpaceProjectChatSurfaceId } from "components/ChatWindowing/projectChatSurfaceIds";
import { ProjectChatWindowSurface } from "components/ChatWindowing/ProjectChatWindowSurface";
import { UnifiedChatSurface } from "components/ChatWindowing/UnifiedChatSurface";
import { GitGraphWindowContent } from "components/Git/GitGraphWindowContent";
import { SectionWindowSurface } from "components/Section/Container/SectionWindowSurface";
import { type SetStateAction } from "react";
import {
  ChatWindowModeEnum,
  ChatWindowPlacementEnum,
  WindowSpaceSurfaceKindEnum,
} from "utils/generatedTypes";
import {
  canControlStandaloneWindowChatId,
  type StandaloneWindowSpaceWindow,
} from "./standaloneWindowSpaceState";

const STANDALONE_WINDOW_SPACE_WINDOW_FRAME_CLASS = "rounded-none shadow-none";

function resolveStandaloneWindowNextChatId(
  currentChatId: string | null,
  next: SetStateAction<string | null | undefined>,
): string | null | undefined {
  if (typeof next === "function") {
    return next(currentChatId ?? undefined);
  }
  return next;
}

export function StandaloneWindowSpaceWindowSurface({
  window,
  projectConfigId,
  windowSpaceId,
  onFocusWindow,
  onProjectChatIdChange,
  onEmbeddedGitPaneVisibleChange,
  onBlockedErrorCodeChange,
}: {
  window: StandaloneWindowSpaceWindow;
  projectConfigId: string;
  windowSpaceId: string;
  onFocusWindow: () => void;
  onProjectChatIdChange: (chatId: string | null | undefined) => void;
  onEmbeddedGitPaneVisibleChange: (visible: boolean) => void;
  onBlockedErrorCodeChange: (errorCode: string | null) => void;
}) {
  const surfaceId = buildStandaloneWindowSpaceProjectChatSurfaceId(
    projectConfigId,
    windowSpaceId,
    window.instanceId,
  );
  const setStandaloneProjectChatId = (
    next: SetStateAction<string | null | undefined>,
  ) => {
    onProjectChatIdChange(
      resolveStandaloneWindowNextChatId(window.chatId, next),
    );
  };

  return (
    <article
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
      onPointerDown={onFocusWindow}
    >
      {window.surfaceKind === WindowSpaceSurfaceKindEnum.section &&
      window.sectionIdOrNull ? (
        <SectionWindowSurface
          sectionId={window.sectionIdOrNull}
          headerActions={null}
          roundedClassName="rounded-none"
          chatHost={ChatWindowPlacementEnum.floating}
          chatModeOverride={window.mode}
          projectChatSurfaceId={surfaceId}
          projectChatId={
            canControlStandaloneWindowChatId(window) ? window.chatId : undefined
          }
          setProjectChatId={
            canControlStandaloneWindowChatId(window)
              ? setStandaloneProjectChatId
              : undefined
          }
          headerProps={{
            onPointerDown: onFocusWindow,
          }}
          onProjectChatBlockedErrorCodeChange={onBlockedErrorCodeChange}
        />
      ) : (
        <ProjectChatWindowSurface
          title={window.title}
          mode={window.mode}
          instanceId={window.instanceId}
          roundedClassName="rounded-none"
          actions={[]}
          onTitleClick={onFocusWindow}
        >
          {window.mode === ChatWindowModeEnum.git_graph_mode ? (
            <GitGraphWindowContent
              instanceId={window.instanceId}
              showEmbeddedGitPaneToggle
              embeddedGitPaneVisible={window.embeddedGitPaneVisible}
              onEmbeddedGitPaneVisibleChange={onEmbeddedGitPaneVisibleChange}
            />
          ) : (
            <UnifiedChatSurface
              key={`${surfaceId}:${window.chatId ?? "global"}`}
              mode={window.mode}
              host={ChatWindowPlacementEnum.floating}
              surfaceId={surfaceId}
              projectChatId={window.chatId}
              setProjectChatId={setStandaloneProjectChatId}
              onProjectChatBlockedErrorCodeChange={onBlockedErrorCodeChange}
            />
          )}
        </ProjectChatWindowSurface>
      )}
    </article>
  );
}
