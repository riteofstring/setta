import { ProjectChat } from "components/Panes/Overview/ProjectLevelAI/ProjectChat";
import { SectionWindowPlaceholder } from "components/Section/Container/SectionWindowPlaceholder";
import { ChatArea } from "components/Section/Layouts/ChatArea";
import type { SetStateAction } from "react";
import { setProjectChatWindowChatId } from "state/actions/projectChatWindowing";
import {
  getExternalProjectChatWindowBindingForSectionInState,
  getProjectChatWindowBindingForSectionInState,
} from "state/actions/projectChatWindowingState";
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
  surfaceId?: string;
  projectChatId?: string | null;
  setProjectChatId?: (next: SetStateAction<string | null | undefined>) => void;
  onProjectChatBlockedErrorCodeChange?: (errorCode: string | null) => void;
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
  surfaceId,
  projectChatId,
  setProjectChatId,
  onProjectChatBlockedErrorCodeChange,
}: UnifiedChatSurfaceProps) {
  const shouldResolveSectionProjectChatBinding =
    mode === ChatWindowModeEnum.project_ai_mode &&
    typeof sectionId === "string" &&
    sectionId.length > 0 &&
    projectChatId === undefined &&
    setProjectChatId === undefined;
  const sectionProjectChatBinding = useProjectState((state) => {
    if (!shouldResolveSectionProjectChatBinding || !sectionId) {
      return null;
    }
    return getProjectChatWindowBindingForSectionInState(
      state.projectChatWindowing,
      sectionId,
    );
  });
  const projectChatProps: {
    surfaceId?: string;
    chatId?: string | null;
    setChatId?: (next: SetStateAction<string | null | undefined>) => void;
    onBlockedErrorCodeChange?: (errorCode: string | null) => void;
  } = {};
  if (surfaceId !== undefined) {
    projectChatProps.surfaceId = surfaceId;
  }
  const resolvedProjectChatId =
    sectionProjectChatBinding?.chatId ?? projectChatId;
  if (resolvedProjectChatId !== undefined) {
    projectChatProps.chatId = resolvedProjectChatId;
  }
  if (sectionProjectChatBinding) {
    projectChatProps.setChatId = (next) => {
      const resolvedChatId =
        typeof next === "function"
          ? next(sectionProjectChatBinding.chatId ?? undefined)
          : next;
      setProjectChatWindowChatId(
        sectionProjectChatBinding.instanceId,
        resolvedChatId,
      );
    };
  } else if (setProjectChatId !== undefined) {
    projectChatProps.setChatId = setProjectChatId;
  }
  if (onProjectChatBlockedErrorCodeChange !== undefined) {
    projectChatProps.onBlockedErrorCodeChange =
      onProjectChatBlockedErrorCodeChange;
  }
  const externalizedWindowId = useProjectState((state) => {
    if (host !== "section_layout" || !sectionId) {
      return null;
    }
    return (
      getExternalProjectChatWindowBindingForSectionInState(
        state.projectChatWindowing,
        sectionId,
      )?.instanceId ?? null
    );
  });
  const remountKeyBase =
    surfaceId ?? `${host}:${sectionId ?? "project-chat-surface"}`;
  const remountKey =
    mode === ChatWindowModeEnum.project_ai_mode &&
    host === "standalone_page" &&
    projectChatId !== undefined
      ? `${remountKeyBase}:chat:${resolvedProjectChatId ?? "__new__"}`
      : remountKeyBase;

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
    if (shouldResolveSectionProjectChatBinding && !sectionProjectChatBinding) {
      return (
        <div
          role="alert"
          className={resolveSurfaceHostClasses(host, className)}
          data-chat-surface-mode={mode}
          data-chat-surface-host={host}
          data-testid={dataTestId}
        >
          <p className="mx-auto mt-2 w-full max-w-[72rem] rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-600/70 dark:bg-amber-950/40 dark:text-amber-200">
            Section project chat surface is missing a project chat binding.
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
        <ProjectChat key={remountKey} {...projectChatProps} />
      </div>
    );
  }

  if (mode === ChatWindowModeEnum.git_graph_mode) {
    return (
      <div
        role="alert"
        className={resolveSurfaceHostClasses(host, className)}
        data-chat-surface-mode={mode}
        data-chat-surface-host={host}
        data-testid={dataTestId}
      >
        <p className="mx-auto mt-2 w-full max-w-[72rem] rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-600/70 dark:bg-amber-950/40 dark:text-amber-200">
          Git graph surfaces must render via GitGraphWindowContent(instanceId).
        </p>
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
      <ChatArea
        key={`${remountKey}:${sectionId}`}
        sectionId={sectionId}
        surfaceId={surfaceId}
        controlledChatId={projectChatId}
        setControlledChatId={setProjectChatId}
      />
    </div>
  );
}
