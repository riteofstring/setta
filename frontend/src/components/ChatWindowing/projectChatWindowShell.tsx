import { GitGraphWindowContent } from "components/Git/GitGraphWindowContent";
import { SectionWindowSurface } from "components/Section/Container/SectionWindowSurface";
import {
  getWindowControlQuickInfoHandlers,
  getWindowControlQuickInfoText,
} from "components/Utils/windowControlQuickInfo";
import type {
  ComponentPropsWithoutRef,
  ReactNode,
  PointerEvent as ReactPointerEvent,
} from "react";
import {
  ChatWindowModeEnum,
  type ChatWindowMode,
  type ChatWindowPlacement,
} from "utils/generatedTypes";
import { buildWorkspaceProjectChatWindowSurfaceId } from "./projectChatSurfaceIds";
import {
  ProjectChatWindowSurface,
  SECTION_WINDOW_ACTION_BUTTON_CLASS,
} from "./ProjectChatWindowSurface";
import { UnifiedChatSurface } from "./UnifiedChatSurface";

type ProjectChatWindowQuickInfoAction =
  | "close_window"
  | "dock_window"
  | "maximize_window"
  | "minimize_window"
  | "restore_window"
  | "show_in_canvas"
  | "show_next_docked_chat"
  | "show_previous_docked_chat"
  | "undock_window";

export type ProjectChatWindowActionSpec = {
  key: string;
  quickInfoAction: ProjectChatWindowQuickInfoAction;
  title?: string | null;
  testId: string;
  instanceId: string;
  icon: ReactNode;
  className?: string;
  disabled?: boolean;
  onClick: () => void;
};

type ProjectChatWindowShellWindow = {
  instanceId: string;
  title: string;
  mode: ChatWindowMode;
  sectionId: string | null;
  chatId: string | null;
};

export function ProjectChatWindowShell({
  window,
  projectConfigId,
  host,
  allowLayoutMutations,
  roundedClassName,
  actionSpecs,
  onTitleClick,
  onSetProjectChatId,
  onTitleCommit,
  headerClassName,
  dragHandleTestId,
  onTitlePointerDown,
  onTitlePointerMove,
  onTitlePointerUp,
  showEmbeddedGitPaneToggle = true,
  showSectionWindowActions = true,
  sectionHeaderProps,
}: {
  window: ProjectChatWindowShellWindow;
  projectConfigId: string;
  host: ChatWindowPlacement;
  allowLayoutMutations: boolean;
  roundedClassName: string;
  actionSpecs: Array<ProjectChatWindowActionSpec>;
  onTitleClick: () => void;
  onSetProjectChatId: (
    instanceId: string,
    next: string | null | undefined,
  ) => void;
  onTitleCommit?: (nextTitle: string) => void;
  headerClassName?: string;
  dragHandleTestId?: string;
  onTitlePointerDown?: (event: ReactPointerEvent<HTMLParagraphElement>) => void;
  onTitlePointerMove?: (event: ReactPointerEvent<HTMLParagraphElement>) => void;
  onTitlePointerUp?: (event: ReactPointerEvent<HTMLParagraphElement>) => void;
  showEmbeddedGitPaneToggle?: boolean;
  showSectionWindowActions?: boolean;
  sectionHeaderProps?: Omit<
    ComponentPropsWithoutRef<"header">,
    "children" | "ref"
  >;
}) {
  if (window.sectionId) {
    return (
      <SectionWindowSurface
        sectionId={window.sectionId}
        roundedClassName={roundedClassName}
        chatHost={host}
        chatModeOverride={window.mode}
        headerActions={
          showSectionWindowActions
            ? renderSectionWindowHeaderActions(actionSpecs)
            : null
        }
        headerProps={sectionHeaderProps}
      />
    );
  }

  return (
    <ProjectChatWindowSurface
      title={window.title}
      mode={window.mode}
      instanceId={window.instanceId}
      allowLayoutMutations={allowLayoutMutations}
      roundedClassName={roundedClassName}
      headerClassName={headerClassName}
      onTitleClick={onTitleClick}
      onTitleCommit={onTitleCommit}
      dragHandleTestId={dragHandleTestId}
      onTitlePointerDown={onTitlePointerDown}
      onTitlePointerMove={onTitlePointerMove}
      onTitlePointerUp={onTitlePointerUp}
      actions={buildProjectChatWindowSurfaceActions(actionSpecs)}
    >
      <ProjectChatWindowBody
        window={window}
        host={host}
        projectConfigId={projectConfigId}
        showEmbeddedGitPaneToggle={showEmbeddedGitPaneToggle}
        onSetProjectChatId={onSetProjectChatId}
      />
    </ProjectChatWindowSurface>
  );
}

function buildProjectChatWindowSurfaceActions(
  actionSpecs: Array<ProjectChatWindowActionSpec>,
): ComponentPropsWithoutRef<typeof ProjectChatWindowSurface>["actions"] {
  return actionSpecs.map((action) => ({
    key: action.key,
    label: getWindowControlQuickInfoText({
      action: action.quickInfoAction,
      title: action.title,
    }),
    testId: action.testId,
    instanceId: action.instanceId,
    icon: action.icon,
    className: action.className,
    disabled: action.disabled,
    onClick: action.onClick,
  }));
}

function renderSectionWindowHeaderActions(
  actionSpecs: Array<ProjectChatWindowActionSpec>,
): ReactNode {
  return (
    <>
      {actionSpecs.map((action) => {
        const label = getWindowControlQuickInfoText({
          action: action.quickInfoAction,
          title: action.title,
        });
        return (
          <button
            key={`${action.instanceId}-${action.key}`}
            type="button"
            className={action.className ?? SECTION_WINDOW_ACTION_BUTTON_CLASS}
            onClick={action.onClick}
            disabled={action.disabled}
            aria-label={label}
            data-testid={action.testId}
            data-chat-window-instance-id={action.instanceId}
            {...getWindowControlQuickInfoHandlers({
              action: action.quickInfoAction,
              title: action.title,
            })}
          >
            {action.icon}
          </button>
        );
      })}
    </>
  );
}

function ProjectChatWindowBody({
  window,
  host,
  projectConfigId,
  showEmbeddedGitPaneToggle,
  onSetProjectChatId,
}: {
  window: ProjectChatWindowShellWindow;
  host: ChatWindowPlacement;
  projectConfigId: string;
  showEmbeddedGitPaneToggle: boolean;
  onSetProjectChatId: (
    instanceId: string,
    next: string | null | undefined,
  ) => void;
}) {
  if (window.mode === ChatWindowModeEnum.git_graph_mode) {
    return (
      <GitGraphWindowContent
        instanceId={window.instanceId}
        showEmbeddedGitPaneToggle={showEmbeddedGitPaneToggle}
      />
    );
  }

  return (
    <UnifiedChatSurface
      mode={window.mode}
      host={host}
      surfaceId={buildWorkspaceProjectChatWindowSurfaceId(
        projectConfigId,
        window.instanceId,
      )}
      projectChatId={window.chatId}
      setProjectChatId={(next) => {
        const resolvedChatId =
          typeof next === "function" ? next(window.chatId ?? undefined) : next;
        onSetProjectChatId(window.instanceId, resolvedChatId);
      }}
    />
  );
}
