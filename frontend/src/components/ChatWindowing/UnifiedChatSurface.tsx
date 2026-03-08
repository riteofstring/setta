import { GitGraphWindowContent } from "components/Git/GitGraphWindowContent";
import { ProjectChat } from "components/Panes/Overview/ProjectLevelAI/ProjectChat";
import { SectionWindowPlaceholder } from "components/Section/Container/SectionWindowPlaceholder";
import { ChatArea } from "components/Section/Layouts/ChatArea";
import type { SetStateAction } from "react";
import { getOpenExternalProjectChatWindowInstanceForSectionInState } from "state/actions/projectChatWindowing";
import { useProjectState } from "state/definitions";
import {
  ChatWindowModeEnum,
  type ChatWindowMode,
  type ChatWindowPlacement,
} from "utils/generatedTypes";

type ChatSurfaceHost = ChatWindowPlacement | "section_layout";
type StandaloneChatSurfaceHost = ChatSurfaceHost | "standalone_page";

type UnifiedChatSurfaceProps = {
  mode: ChatWindowMode;
  host: StandaloneChatSurfaceHost;
  sectionId?: string | null;
  className?: string;
  dataTestId?: string;
  projectChatId?: string | null;
  setProjectChatId?: (next: SetStateAction<string | null | undefined>) => void;
};

function resolveSurfaceHostClasses(
  host: StandaloneChatSurfaceHost,
  className?: string,
): string {
  let baseClassName = "flex min-h-0 flex-1 flex-col";
  if (host === "section_layout") {
    baseClassName =
      "section-main-full-w flex min-h-0 flex-1 flex-col overflow-hidden";
  } else if (host === "standalone_page") {
    baseClassName = "flex min-h-0 flex-1 flex-col overflow-hidden";
  }
  if (!className) {
    return baseClassName;
  }
  return `${baseClassName} ${className}`;
}

export function UnifiedChatSurface({
  mode,
  host,
  sectionId = null,
  className,
  dataTestId,
  projectChatId,
  setProjectChatId,
}: UnifiedChatSurfaceProps) {
  const projectChatProps: {
    chatId?: string | null;
    setChatId?: (next: SetStateAction<string | null | undefined>) => void;
  } = {};
  if (projectChatId !== undefined) {
    projectChatProps.chatId = projectChatId;
  }
  if (setProjectChatId !== undefined) {
    projectChatProps.setChatId = setProjectChatId;
  }
  const externalizedWindowId = useProjectState((state) => {
    if (host !== "section_layout" || !sectionId) {
      return null;
    }
    return (
      getOpenExternalProjectChatWindowInstanceForSectionInState(
        state.projectChatWindowing,
        sectionId,
      )?.instanceId ?? null
    );
  });

  if (externalizedWindowId && sectionId) {
    return (
      <SectionWindowPlaceholder
        instanceId={externalizedWindowId}
        sectionId={sectionId}
        dataTestId="project-chat-canvas-floating-placeholder"
      />
    );
  }

  if (mode === ChatWindowModeEnum.project_ai_mode) {
    return (
      <div
        className={resolveSurfaceHostClasses(host, className)}
        data-chat-surface-mode={mode}
        data-chat-surface-host={host}
        data-testid={dataTestId}
      >
        <ProjectChat {...projectChatProps} />
      </div>
    );
  }

  if (mode === ChatWindowModeEnum.git_graph_mode) {
    return (
      <div
        className={resolveSurfaceHostClasses(host, className)}
        data-chat-surface-mode={mode}
        data-chat-surface-host={host}
        data-testid={dataTestId}
      >
        <GitGraphWindowContent />
      </div>
    );
  }

  if (!sectionId) {
    return (
      <div
        role="alert"
        className={resolveSurfaceHostClasses(host, className)}
        data-chat-surface-mode={mode}
        data-chat-surface-host={host}
        data-testid={dataTestId}
      >
        <p className="mx-auto mt-2 w-full max-w-[72rem] rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-600/70 dark:bg-amber-950/40 dark:text-amber-200">
          Section chat surface is missing a section id.
        </p>
      </div>
    );
  }

  return (
    <div
      className={resolveSurfaceHostClasses(host, className)}
      data-chat-surface-mode={mode}
      data-chat-surface-host={host}
      data-testid={dataTestId}
    >
      <ChatArea sectionId={sectionId} />
    </div>
  );
}
