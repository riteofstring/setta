import { ProjectChat } from "components/Panes/Overview/ProjectLevelAI/ProjectChat";
import { ChatArea } from "components/Section/Layouts/ChatArea";
import { RiChat3Line } from "react-icons/ri";
import { getOpenFloatingProjectChatWindowInstanceForSectionInState } from "state/actions/projectChatWindowing";
import { useProjectState } from "state/definitions";
import {
  ChatWindowModeEnum,
  type ChatWindowMode,
  type ChatWindowPlacement,
} from "utils/generatedTypes";

type ChatSurfaceHost = ChatWindowPlacement | "section_layout";

type UnifiedChatSurfaceProps = {
  mode: ChatWindowMode;
  host: ChatSurfaceHost;
  sectionId?: string | null;
  className?: string;
  dataTestId?: string;
};

function resolveSurfaceClasses(className?: string): string {
  if (!className) {
    return "flex min-h-0 flex-1 flex-col";
  }
  return `flex min-h-0 flex-1 flex-col ${className}`;
}

export function UnifiedChatSurface({
  mode,
  host,
  sectionId = null,
  className,
  dataTestId,
}: UnifiedChatSurfaceProps) {
  const externalizedFloatingWindowId = useProjectState((state) => {
    if (host !== "section_layout" || !sectionId) {
      return null;
    }
    return (
      getOpenFloatingProjectChatWindowInstanceForSectionInState(
        state.projectChatWindowing,
        sectionId,
      )?.instanceId ?? null
    );
  });

  if (externalizedFloatingWindowId) {
    return (
      <div
        className={resolveSurfaceClasses(className)}
        data-chat-surface-mode={mode}
        data-chat-surface-host={host}
        data-testid={dataTestId}
      >
        <div
          className="pointer-events-none relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-md border border-dashed border-setta-300/80 bg-setta-100/45 dark:border-setta-600/80 dark:bg-setta-900/35"
          data-testid="project-chat-canvas-floating-placeholder"
          data-chat-window-instance-id={externalizedFloatingWindowId}
          data-chat-window-section-id={sectionId}
        >
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-setta-300/20 via-setta-200/20 to-transparent dark:from-setta-600/15 dark:via-setta-700/10 dark:to-transparent" />
          <div className="pointer-events-none relative flex max-w-[22rem] flex-col items-center gap-2 rounded-xl border border-setta-300/70 bg-white/75 px-5 py-4 text-center shadow-sm dark:border-setta-600/70 dark:bg-setta-925/70">
            <RiChat3Line
              size={26}
              className="text-setta-600/90 dark:text-setta-200/90"
            />
            <p className="text-sm font-semibold text-setta-900 dark:text-setta-100">
              Chat moved to floating window
            </p>
            <p className="text-xs text-setta-700/90 dark:text-setta-200/85">
              Use Project AI Chat manager controls to focus, dock, or hide it.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (mode === ChatWindowModeEnum.project_ai_mode) {
    return (
      <div
        className={resolveSurfaceClasses(className)}
        data-chat-surface-mode={mode}
        data-chat-surface-host={host}
        data-testid={dataTestId}
      >
        <ProjectChat />
      </div>
    );
  }

  if (!sectionId) {
    return (
      <div
        role="alert"
        className={resolveSurfaceClasses(className)}
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
      className={resolveSurfaceClasses(className)}
      data-chat-surface-mode={mode}
      data-chat-surface-host={host}
      data-testid={dataTestId}
    >
      <ChatArea sectionId={sectionId} />
    </div>
  );
}
