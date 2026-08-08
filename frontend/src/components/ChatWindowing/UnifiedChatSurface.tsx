import { ProjectChat } from "components/Panes/Overview/ProjectLevelAI/ProjectChat";
import { SectionWindowPlaceholder } from "components/Section/Container/SectionWindowPlaceholder";
import { ChatArea } from "components/Section/Layouts/ChatArea";
import type { SetStateAction } from "react";
import {
  getExternalProjectChatWindowBindingForSectionInState,
  getProjectChatWindowBindingForSectionInState,
  setProjectChatWindowChatId,
} from "state/actions/projectChatWindowing";
import { useProjectState } from "state/definitions";
import {
  ChatWindowModeEnum,
  type ChatWindowMode,
  type ChatWindowPlacement,
} from "utils/generatedTypes";

type ChatSurfaceHost = ChatWindowPlacement | "section_layout";
type StandaloneChatSurfaceHost = ChatSurfaceHost | "standalone_page";
type ProjectChatBinding = ReturnType<
  typeof getProjectChatWindowBindingForSectionInState
>;

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
type ProjectChatProps = {
  surfaceId?: string;
  chatId?: string | null;
  setChatId?: (next: SetStateAction<string | null | undefined>) => void;
  onBlockedErrorCodeChange?: (errorCode: string | null) => void;
};
type ProjectChatRenderState = {
  projectChatProps: ProjectChatProps;
  resolvedProjectChatId: string | null | undefined;
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

function shouldResolveSectionProjectChatBinding({
  mode,
  sectionId,
  projectChatId,
  setProjectChatId,
}: Pick<
  UnifiedChatSurfaceProps,
  "mode" | "sectionId" | "projectChatId" | "setProjectChatId"
>): boolean {
  return (
    mode === ChatWindowModeEnum.project_ai_mode &&
    typeof sectionId === "string" &&
    sectionId.length > 0 &&
    projectChatId === undefined &&
    setProjectChatId === undefined
  );
}

function useSectionProjectChatBinding({
  mode,
  sectionId,
  projectChatId,
  setProjectChatId,
}: Pick<
  UnifiedChatSurfaceProps,
  "mode" | "sectionId" | "projectChatId" | "setProjectChatId"
>): {
  shouldResolve: boolean;
  sectionProjectChatBinding: ProjectChatBinding;
} {
  const shouldResolve = shouldResolveSectionProjectChatBinding({
    mode,
    sectionId,
    projectChatId,
    setProjectChatId,
  });
  const sectionProjectChatBinding = useProjectState((state) => {
    if (!shouldResolve || !sectionId) {
      return null;
    }
    return getProjectChatWindowBindingForSectionInState(
      state.projectChatWindowing,
      sectionId,
    );
  });
  return {
    shouldResolve,
    sectionProjectChatBinding,
  };
}

function resolveProjectChatSetter({
  sectionProjectChatBinding,
  setProjectChatId,
}: {
  sectionProjectChatBinding: ProjectChatBinding;
  setProjectChatId: UnifiedChatSurfaceProps["setProjectChatId"];
}): ProjectChatProps["setChatId"] {
  if (sectionProjectChatBinding) {
    return (next) => {
      const resolvedChatId =
        typeof next === "function"
          ? next(sectionProjectChatBinding.chatId ?? undefined)
          : next;
      setProjectChatWindowChatId(
        sectionProjectChatBinding.instanceId,
        resolvedChatId,
      );
    };
  }
  return setProjectChatId;
}

function buildProjectChatRenderState({
  surfaceId,
  projectChatId,
  setProjectChatId,
  onProjectChatBlockedErrorCodeChange,
  sectionProjectChatBinding,
}: Pick<
  UnifiedChatSurfaceProps,
  | "surfaceId"
  | "projectChatId"
  | "setProjectChatId"
  | "onProjectChatBlockedErrorCodeChange"
> & {
  sectionProjectChatBinding: ProjectChatBinding;
}): ProjectChatRenderState {
  const projectChatProps: ProjectChatProps = {};
  if (surfaceId !== undefined) {
    projectChatProps.surfaceId = surfaceId;
  }
  const resolvedProjectChatId =
    sectionProjectChatBinding?.chatId ?? projectChatId;
  if (resolvedProjectChatId !== undefined) {
    projectChatProps.chatId = resolvedProjectChatId;
  }
  const setChatId = resolveProjectChatSetter({
    sectionProjectChatBinding,
    setProjectChatId,
  });
  if (setChatId !== undefined) {
    projectChatProps.setChatId = setChatId;
  }
  if (onProjectChatBlockedErrorCodeChange !== undefined) {
    projectChatProps.onBlockedErrorCodeChange =
      onProjectChatBlockedErrorCodeChange;
  }
  return {
    projectChatProps,
    resolvedProjectChatId,
  };
}

function useExternalizedWindowId(
  host: StandaloneChatSurfaceHost,
  sectionId: string | null,
): string | null {
  return useProjectState((state) => {
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
}

function resolveRemountKey({
  mode,
  host,
  sectionId,
  surfaceId,
  projectChatId,
  resolvedProjectChatId,
}: Pick<
  UnifiedChatSurfaceProps,
  "mode" | "host" | "sectionId" | "surfaceId" | "projectChatId"
> & {
  resolvedProjectChatId: string | null | undefined;
}): string {
  const remountKeyBase =
    surfaceId ?? `${host}:${sectionId ?? "project-chat-surface"}`;
  if (
    mode === ChatWindowModeEnum.project_ai_mode &&
    host === "standalone_page" &&
    projectChatId !== undefined
  ) {
    return `${remountKeyBase}:chat:${resolvedProjectChatId ?? "__new__"}`;
  }
  return remountKeyBase;
}

function renderAlertSurface({
  host,
  className,
  mode,
  dataTestId,
  message,
}: Pick<
  UnifiedChatSurfaceProps,
  "host" | "className" | "mode" | "dataTestId"
> & {
  message: string;
}) {
  return (
    <div
      role="alert"
      className={resolveSurfaceHostClasses(host, className)}
      data-chat-surface-mode={mode}
      data-chat-surface-host={host}
      data-testid={dataTestId}
    >
      <p className="mx-auto mt-2 w-full max-w-[72rem] rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-600/70 dark:bg-amber-950/40 dark:text-amber-200">
        {message}
      </p>
    </div>
  );
}

function renderProjectChatSurface({
  host,
  className,
  mode,
  dataTestId,
  shouldResolveSectionProjectChatBinding,
  sectionProjectChatBinding,
  remountKey,
  projectChatProps,
}: Pick<
  UnifiedChatSurfaceProps,
  "host" | "className" | "mode" | "dataTestId"
> & {
  shouldResolveSectionProjectChatBinding: boolean;
  sectionProjectChatBinding: ProjectChatBinding;
  remountKey: string;
  projectChatProps: ProjectChatProps;
}) {
  if (shouldResolveSectionProjectChatBinding && !sectionProjectChatBinding) {
    return renderAlertSurface({
      host,
      className,
      mode,
      dataTestId,
      message:
        "Section project chat surface is missing a project chat binding.",
    });
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

function renderSectionChatSurface({
  host,
  className,
  mode,
  dataTestId,
  remountKey,
  sectionId,
  surfaceId,
  projectChatId,
  setProjectChatId,
}: Pick<
  UnifiedChatSurfaceProps,
  | "host"
  | "className"
  | "mode"
  | "dataTestId"
  | "surfaceId"
  | "projectChatId"
  | "setProjectChatId"
> & {
  remountKey: string;
  sectionId: string;
}) {
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
  const { shouldResolve, sectionProjectChatBinding } =
    useSectionProjectChatBinding({
      mode,
      sectionId,
      projectChatId,
      setProjectChatId,
    });
  const { projectChatProps, resolvedProjectChatId } =
    buildProjectChatRenderState({
      surfaceId,
      projectChatId,
      setProjectChatId,
      onProjectChatBlockedErrorCodeChange,
      sectionProjectChatBinding,
    });
  const externalizedWindowId = useExternalizedWindowId(host, sectionId);
  const remountKey = resolveRemountKey({
    mode,
    host,
    sectionId,
    surfaceId,
    projectChatId,
    resolvedProjectChatId,
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
    return renderProjectChatSurface({
      host,
      className,
      mode,
      dataTestId,
      shouldResolveSectionProjectChatBinding: shouldResolve,
      sectionProjectChatBinding,
      remountKey,
      projectChatProps,
    });
  }

  if (mode === ChatWindowModeEnum.git_graph_mode) {
    return renderAlertSurface({
      host,
      className,
      mode,
      dataTestId,
      message:
        "Git graph surfaces must render via GitGraphWindowContent(instanceId).",
    });
  }

  if (!sectionId) {
    return renderAlertSurface({
      host,
      className,
      mode,
      dataTestId,
      message: "Section chat surface is missing a section id.",
    });
  }

  return renderSectionChatSurface({
    host,
    className,
    mode,
    dataTestId,
    remountKey,
    sectionId,
    surfaceId,
    projectChatId,
    setProjectChatId,
  });
}
