import {
  canUseManagedChatLLM,
  standaloneSectionRequiresManagedChat,
  standaloneWindowSpaceHasAllowedWindows,
  type ManagedChatSurfaceAuthorityState,
} from "components/Chat/sharePolicyChatAccess";
import { ProjectChatWindowSurface } from "components/ChatWindowing/ProjectChatWindowSurface";
import { UnifiedChatSurface } from "components/ChatWindowing/UnifiedChatSurface";
import {
  buildStandalonePageProjectChatSurfaceId,
  buildStandalonePageSectionProjectChatSurfaceId,
} from "components/ChatWindowing/projectChatSurfaceIds";
import { MaybeManyNestedSections } from "components/Section/Container/ManyNestedSections";
import { SectionWindowSurface } from "components/Section/Container/SectionWindowSurface";
import { useCodeMirrorStyleLoader } from "components/Utils/CodeMirror/useCodeMirrorStyleLoader";
import { FloatingBox } from "components/Utils/FloatingBox";
import { SectionDndContext } from "forks/dnd-kit/SectionDndContext";
import { useAddMouseLocationListener } from "gpuFlow/mouseLocation";
import { usePluginRuntimeBootstrap } from "plugins/runtime";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type SetStateAction,
} from "react";
import { useNavigate, useParams } from "react-router-dom";
import { buildChatHistoryEntries } from "state/actions/chatHistory";
import {
  useAIStore,
  useProjectState,
  useShareSession,
} from "state/definitions";
import { useLoadProjectConfig } from "state/hooks/project";
import {
  ChatWindowModeEnum,
  SectionTypeEnum,
  type SectionType,
  type WindowSpaceConfig,
} from "utils/generatedTypes";
import { resolveStandaloneSectionSlug } from "utils/sectionSlugPaths";
import { resolveStandaloneWindowSpaceSlug } from "utils/windowSpacePaths";
import { shallow } from "zustand/shallow";
import { LoadingSpinner } from "../LoadingSpinner";
import { NotFound } from "../NotFound/NotFound";
import { StandaloneWindowSpaceSurface } from "./StandaloneWindowSpaceSurface";

type StandaloneSurfaceTarget =
  | {
      kind: "project_chat";
    }
  | {
      kind: "project_chat_thread";
      chatId: string;
    }
  | {
      kind: "project_chat_thread_not_found";
    }
  | {
      kind: "section";
      sectionId: string;
      sectionName: string;
      sectionType: SectionType;
    }
  | {
      kind: "window_space";
      windowSpaceId: string;
      windowSpaceName: string;
    }
  | {
      kind: "section_not_found";
    }
  | {
      kind: "window_space_not_found";
    };

type StandaloneSurfaceErrorCode = "chat_not_found" | "llm_disallowed";
type StandaloneSurfaceErrorState = {
  ownerKey: string | null;
  errorCode: StandaloneSurfaceErrorCode | null;
};
type StandaloneProjectChatTarget = Extract<
  StandaloneSurfaceTarget,
  {
    kind:
      | "project_chat"
      | "project_chat_thread"
      | "project_chat_thread_not_found";
  }
>;
type StandaloneProjectChatSurfaceViewState =
  | {
      kind: "not_found";
      description: string;
    }
  | {
      kind: "surface";
      dataTestId:
        | "standalone-project-chat-surface"
        | "standalone-project-chat-thread-surface";
      projectChatId: string | null;
      title: string;
    };

function normalizeStandaloneChatId(
  chatId: string | null | undefined,
): string | null {
  const normalizedChatId = chatId?.trim() ?? "";
  if (!normalizedChatId) {
    return null;
  }
  return normalizedChatId;
}

function buildStandaloneProjectChatPath(
  projectConfigName: string,
  chatId: string | null,
): string {
  const basePath = `/${encodeURIComponent(projectConfigName)}/chat`;
  if (chatId === null) {
    return basePath;
  }
  return `${basePath}/${encodeURIComponent(chatId)}`;
}

function resolveStandaloneSurfaceTarget(
  state: Parameters<typeof resolveStandaloneSectionSlug>[0],
  sectionSlug: string | undefined,
  chatId: string | undefined,
  windowSpaceSlug: string | undefined,
): StandaloneSurfaceTarget {
  const normalizedChatId = normalizeStandaloneChatId(chatId);
  if (normalizedChatId) {
    return {
      kind: "project_chat_thread",
      chatId: normalizedChatId,
    };
  }
  if (chatId !== undefined) {
    return { kind: "project_chat_thread_not_found" };
  }
  if (windowSpaceSlug) {
    const resolution = resolveStandaloneWindowSpaceSlug(state, windowSpaceSlug);
    if (resolution.kind !== "found") {
      return { kind: "window_space_not_found" };
    }
    return {
      kind: "window_space",
      windowSpaceId: resolution.windowSpaceId,
      windowSpaceName: resolution.windowSpace.name,
    };
  }
  if (!sectionSlug) {
    return { kind: "project_chat" };
  }
  const resolution = resolveStandaloneSectionSlug(state, sectionSlug);
  if (resolution.kind !== "found") {
    return { kind: "section_not_found" };
  }
  return {
    kind: "section",
    sectionId: resolution.sectionId,
    sectionName: resolution.sectionName,
    sectionType: resolution.sectionType,
  };
}

function resolveStandaloneDocumentTitle(
  projectConfigName: string | undefined,
  target: StandaloneSurfaceTarget,
  is404: boolean,
  projectChatThreadTitle: string | null,
): string {
  if (is404) {
    return "Not Found";
  }
  if (!projectConfigName) {
    return "setta.dev";
  }
  const targetTitle = resolveStandaloneTargetTitle(
    target,
    projectChatThreadTitle,
  );
  if (targetTitle === null) {
    return `${projectConfigName} Chat`;
  }
  return `${projectConfigName} · ${targetTitle}`;
}

function resolveStandaloneTargetTitle(
  target: StandaloneSurfaceTarget,
  projectChatThreadTitle: string | null,
): string | null {
  switch (target.kind) {
    case "project_chat":
      return null;
    case "project_chat_thread":
      return projectChatThreadTitle ?? "Chat";
    case "project_chat_thread_not_found":
      return "Thread Not Found";
    case "section":
      return target.sectionName;
    case "window_space":
      return target.windowSpaceName;
    case "window_space_not_found":
      return "Window Space Not Found";
    case "section_not_found":
      return "Section Not Found";
  }
}

function normalizeStandaloneSurfaceErrorCode(
  errorCode: string | null,
): StandaloneSurfaceErrorCode | null {
  if (errorCode === "chat_not_found" || errorCode === "llm_disallowed") {
    return errorCode;
  }
  return null;
}

function buildStandaloneSurfaceOwnerKey(
  projectConfigId: string,
  target: StandaloneSurfaceTarget,
): string | null {
  if (target.kind === "project_chat") {
    return `${projectConfigId}:project-chat`;
  }
  if (target.kind === "project_chat_thread") {
    return `${projectConfigId}:project-chat:${target.chatId}`;
  }
  if (target.kind === "section") {
    return `${projectConfigId}:section:${target.sectionId}`;
  }
  if (target.kind === "window_space") {
    return `${projectConfigId}:window-space:${target.windowSpaceId}`;
  }
  return null;
}

function StandaloneSectionBody({
  sectionId,
  sectionType,
}: {
  sectionId: string;
  sectionType: SectionType;
}) {
  if (
    sectionType !== SectionTypeEnum.Group &&
    sectionType !== SectionTypeEnum.ListRoot
  ) {
    return null;
  }
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <MaybeManyNestedSections
        sectionId={sectionId}
        isGroup={sectionType === SectionTypeEnum.Group}
      />
    </div>
  );
}

function StandaloneSurfaceShell({ children }: { children: React.ReactNode }) {
  return (
    <SectionDndContext>
      <section
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
        data-testid="standalone-project-surface-page"
      >
        <div className="flex min-h-0 flex-1 overflow-hidden">{children}</div>
        <FloatingBox />
      </section>
    </SectionDndContext>
  );
}

function StandaloneManagedChatBlockedSurface() {
  return (
    <StandaloneSurfaceShell>
      <div
        className="relative min-h-0 flex-1"
        data-testid="standalone-managed-chat-blocked"
      >
        <NotFound
          title="Managed Chat Unavailable"
          description="This deployment does not allow LLM access for standalone managed chat surfaces."
        />
      </div>
    </StandaloneSurfaceShell>
  );
}

type StandaloneNotFoundSurfaceProps = {
  dataTestId:
    | "standalone-project-chat-thread-not-found"
    | "standalone-section-not-found"
    | "standalone-window-space-not-found";
  title: string;
  description: string;
};

function StandaloneNotFoundSurface({
  dataTestId,
  title,
  description,
}: StandaloneNotFoundSurfaceProps) {
  return (
    <StandaloneSurfaceShell>
      <div className="relative min-h-0 flex-1" data-testid={dataTestId}>
        <NotFound title={title} description={description} />
      </div>
    </StandaloneSurfaceShell>
  );
}

function useStandaloneManagedChatAuthorityState(): ManagedChatSurfaceAuthorityState {
  const { sections, sectionVariants, sectionImpls, sectionVariantMap } =
    useProjectState(
      (state) => ({
        sections: state.sections,
        sectionVariants: state.sectionVariants,
        sectionImpls: state.sectionImpls,
        sectionVariantMap: state.projectConfig.sectionVariantMap,
      }),
      shallow,
    );
  return useMemo(
    () => ({
      projectConfig: {
        sectionVariantMap,
      },
      sections,
      sectionVariants,
      sectionImpls,
    }),
    [sectionImpls, sectionVariantMap, sectionVariants, sections],
  );
}

function useStandaloneProjectChatThreadInfo(
  target: StandaloneSurfaceTarget,
  projectConfigId: string,
) {
  const agentRuns = useAIStore((state) => state.agentRuns);
  const projectChatHistoryEntries = useMemo(
    () =>
      buildChatHistoryEntries(agentRuns, {
        projectConfigId,
        unscopedOnly: true,
      }),
    [agentRuns, projectConfigId],
  );
  const standaloneProjectChatThreadEntry = useMemo(() => {
    if (target.kind !== "project_chat_thread") {
      return null;
    }
    return (
      projectChatHistoryEntries.find(
        (entry) => entry.chatId === target.chatId,
      ) ?? null
    );
  }, [projectChatHistoryEntries, target]);
  return useMemo(
    () => ({
      projectChatThreadTitle:
        target.kind === "project_chat_thread"
          ? standaloneProjectChatThreadEntry?.label ??
            `Chat ${target.chatId.slice(0, 8)}`
          : null,
      standaloneProjectChatId:
        target.kind === "project_chat_thread" ? target.chatId : null,
      standaloneProjectChatThreadRouteInvalid:
        target.kind === "project_chat_thread_not_found",
    }),
    [standaloneProjectChatThreadEntry, target],
  );
}

function useStandaloneSurfaceErrorState(
  ownerKey: string | null,
  canUseManagedChat: boolean,
) {
  const [standaloneSurfaceErrorState, setStandaloneSurfaceErrorState] =
    useState<StandaloneSurfaceErrorState>({
      ownerKey: null,
      errorCode: null,
    });
  const previousCanUseManagedChat = useRef(canUseManagedChat);

  useEffect(() => {
    setStandaloneSurfaceErrorState((current) => {
      if (current.ownerKey === ownerKey) {
        return current;
      }
      return {
        ownerKey,
        errorCode: null,
      };
    });
  }, [ownerKey]);

  useEffect(() => {
    if (!previousCanUseManagedChat.current && canUseManagedChat) {
      setStandaloneSurfaceErrorState((current) => {
        if (current.errorCode !== "llm_disallowed") {
          return current;
        }
        return {
          ownerKey,
          errorCode: null,
        };
      });
    }
    previousCanUseManagedChat.current = canUseManagedChat;
  }, [canUseManagedChat, ownerKey]);

  const setStandaloneSurfaceErrorCode = (errorCode: string | null) => {
    const normalizedErrorCode = normalizeStandaloneSurfaceErrorCode(errorCode);
    setStandaloneSurfaceErrorState((current) => {
      if (
        current.ownerKey === ownerKey &&
        current.errorCode === normalizedErrorCode
      ) {
        return current;
      }
      return {
        ownerKey,
        errorCode: normalizedErrorCode,
      };
    });
  };

  return {
    standaloneSurfaceErrorState,
    setStandaloneSurfaceErrorCode,
  };
}

function useStandaloneProjectChatNavigation(
  projectConfigName: string | undefined,
  standaloneProjectChatId: string | null,
) {
  const navigate = useNavigate();
  return (next: SetStateAction<string | null | undefined>) => {
    if (!projectConfigName) {
      return;
    }
    const resolvedChatId =
      typeof next === "function"
        ? next(standaloneProjectChatId ?? undefined)
        : next;
    navigate(
      buildStandaloneProjectChatPath(
        projectConfigName,
        normalizeStandaloneChatId(resolvedChatId),
      ),
    );
  };
}

function standaloneTargetRequiresManagedChat(
  target: StandaloneSurfaceTarget,
  managedChatAuthorityState: ManagedChatSurfaceAuthorityState,
): boolean {
  if (target.kind === "project_chat" || target.kind === "project_chat_thread") {
    return true;
  }
  if (target.kind !== "section") {
    return false;
  }
  return standaloneSectionRequiresManagedChat(
    managedChatAuthorityState,
    target.sectionId,
  );
}

function standaloneWindowSpaceBlocksManagedChat(
  standaloneWindowSpace: WindowSpaceConfig | null,
  managedChatAuthorityState: ManagedChatSurfaceAuthorityState,
  canUseManagedChat: boolean,
): boolean {
  if (canUseManagedChat || !standaloneWindowSpace) {
    return false;
  }
  if (Object.keys(standaloneWindowSpace.windowsById).length === 0) {
    return false;
  }
  return !standaloneWindowSpaceHasAllowedWindows(
    standaloneWindowSpace,
    managedChatAuthorityState,
    canUseManagedChat,
  );
}

function resolveShouldBlockStandaloneManagedChat({
  target,
  standaloneWindowSpace,
  managedChatAuthorityState,
  canUseManagedChat,
  standaloneManagedChatDenied,
}: {
  target: StandaloneSurfaceTarget;
  standaloneWindowSpace: WindowSpaceConfig | null;
  managedChatAuthorityState: ManagedChatSurfaceAuthorityState;
  canUseManagedChat: boolean;
  standaloneManagedChatDenied: boolean;
}): boolean {
  if (target.kind === "window_space") {
    return standaloneWindowSpaceBlocksManagedChat(
      standaloneWindowSpace,
      managedChatAuthorityState,
      canUseManagedChat,
    );
  }
  if (!canUseManagedChat) {
    return standaloneTargetRequiresManagedChat(
      target,
      managedChatAuthorityState,
    );
  }
  return standaloneManagedChatDenied;
}

function isStandaloneProjectChatTarget(
  target: StandaloneSurfaceTarget,
): target is StandaloneProjectChatTarget {
  return (
    target.kind === "project_chat" ||
    target.kind === "project_chat_thread" ||
    target.kind === "project_chat_thread_not_found"
  );
}

function resolveStandaloneProjectChatSurfaceViewState({
  target,
  projectChatThreadTitle,
  standaloneProjectChatId,
  standaloneProjectChatThreadMissing,
  standaloneProjectChatThreadRouteInvalid,
}: {
  target: StandaloneProjectChatTarget;
  projectChatThreadTitle: string | null;
  standaloneProjectChatId: string | null;
  standaloneProjectChatThreadMissing: boolean;
  standaloneProjectChatThreadRouteInvalid: boolean;
}): StandaloneProjectChatSurfaceViewState {
  if (standaloneProjectChatThreadRouteInvalid) {
    return {
      kind: "not_found",
      description: "This standalone project chat route is invalid.",
    };
  }
  if (standaloneProjectChatThreadMissing) {
    return {
      kind: "not_found",
      description: "No project chat thread matches this standalone route.",
    };
  }
  return {
    kind: "surface",
    dataTestId:
      target.kind === "project_chat_thread"
        ? "standalone-project-chat-thread-surface"
        : "standalone-project-chat-surface",
    projectChatId: standaloneProjectChatId,
    title: projectChatThreadTitle ?? "Project AI Chat",
  };
}

function resolveStandaloneSectionBodyOverride(
  sectionId: string,
  sectionType: SectionType,
) {
  if (
    sectionType !== SectionTypeEnum.Group &&
    sectionType !== SectionTypeEnum.ListRoot
  ) {
    return undefined;
  }
  return (
    <StandaloneSectionBody sectionId={sectionId} sectionType={sectionType} />
  );
}

function StandaloneProjectChatSurface({
  projectConfigId,
  target,
  projectChatThreadTitle,
  standaloneProjectChatId,
  standaloneProjectChatThreadMissing,
  standaloneProjectChatThreadRouteInvalid,
  setStandaloneProjectChatId,
  setStandaloneSurfaceErrorCode,
}: {
  projectConfigId: string;
  target: StandaloneProjectChatTarget;
  projectChatThreadTitle: string | null;
  standaloneProjectChatId: string | null;
  standaloneProjectChatThreadMissing: boolean;
  standaloneProjectChatThreadRouteInvalid: boolean;
  setStandaloneProjectChatId: (
    next: SetStateAction<string | null | undefined>,
  ) => void;
  setStandaloneSurfaceErrorCode: (errorCode: string | null) => void;
}) {
  const viewState = resolveStandaloneProjectChatSurfaceViewState({
    target,
    projectChatThreadTitle,
    standaloneProjectChatId,
    standaloneProjectChatThreadMissing,
    standaloneProjectChatThreadRouteInvalid,
  });
  if (viewState.kind === "not_found") {
    return (
      <StandaloneNotFoundSurface
        dataTestId="standalone-project-chat-thread-not-found"
        title="Thread Not Found"
        description={viewState.description}
      />
    );
  }
  return (
    <StandaloneSurfaceShell>
      <ProjectChatWindowSurface
        title={viewState.title}
        mode={ChatWindowModeEnum.project_ai_mode}
        instanceId={`standalone-project-chat:${projectConfigId}`}
        actions={[]}
        showHeader={false}
        allowLayoutMutations={false}
        onTitleClick={() => {}}
        roundedClassName="rounded-none"
      >
        <UnifiedChatSurface
          mode="project_ai_mode"
          host="standalone_page"
          surfaceId={buildStandalonePageProjectChatSurfaceId(projectConfigId)}
          projectChatId={viewState.projectChatId}
          setProjectChatId={setStandaloneProjectChatId}
          onProjectChatBlockedErrorCodeChange={setStandaloneSurfaceErrorCode}
          dataTestId={viewState.dataTestId}
        />
      </ProjectChatWindowSurface>
    </StandaloneSurfaceShell>
  );
}

function StandaloneWindowSpaceContent({
  projectConfigId,
  standaloneWindowSpace,
  canUseManagedChat,
  managedChatAuthorityState,
}: {
  projectConfigId: string;
  standaloneWindowSpace: WindowSpaceConfig | null;
  canUseManagedChat: boolean;
  managedChatAuthorityState: ManagedChatSurfaceAuthorityState;
}) {
  if (!standaloneWindowSpace) {
    return (
      <StandaloneNotFoundSurface
        dataTestId="standalone-window-space-not-found"
        title="Window Space Not Found"
        description="No saved window space matches this standalone route."
      />
    );
  }
  return (
    <StandaloneSurfaceShell>
      <StandaloneWindowSpaceSurface
        key={`${projectConfigId}:${standaloneWindowSpace.id}`}
        windowSpace={standaloneWindowSpace}
        canUseManagedChat={canUseManagedChat}
        managedChatAuthorityState={managedChatAuthorityState}
      />
    </StandaloneSurfaceShell>
  );
}

function StandaloneSectionSurface({
  projectConfigId,
  target,
  setStandaloneSurfaceErrorCode,
}: {
  projectConfigId: string;
  target: Extract<StandaloneSurfaceTarget, { kind: "section" }>;
  setStandaloneSurfaceErrorCode: (errorCode: string | null) => void;
}) {
  return (
    <StandaloneSurfaceShell>
      <div
        className="flex min-h-0 flex-1 overflow-hidden"
        data-testid="standalone-section-surface"
      >
        <SectionWindowSurface
          sectionId={target.sectionId}
          headerActions={null}
          roundedClassName="rounded-none"
          chatHost="standalone_page"
          projectChatSurfaceId={buildStandalonePageSectionProjectChatSurfaceId(
            projectConfigId,
            target.sectionId,
          )}
          onProjectChatBlockedErrorCodeChange={setStandaloneSurfaceErrorCode}
          bodyOverride={resolveStandaloneSectionBodyOverride(
            target.sectionId,
            target.sectionType,
          )}
        />
      </div>
    </StandaloneSurfaceShell>
  );
}

function StandaloneSurfaceContent({
  target,
  projectConfigId,
  projectChatThreadTitle,
  standaloneProjectChatId,
  standaloneProjectChatThreadMissing,
  standaloneProjectChatThreadRouteInvalid,
  standaloneWindowSpace,
  canUseManagedChat,
  managedChatAuthorityState,
  setStandaloneProjectChatId,
  setStandaloneSurfaceErrorCode,
}: {
  target: StandaloneSurfaceTarget;
  projectConfigId: string;
  projectChatThreadTitle: string | null;
  standaloneProjectChatId: string | null;
  standaloneProjectChatThreadMissing: boolean;
  standaloneProjectChatThreadRouteInvalid: boolean;
  standaloneWindowSpace: WindowSpaceConfig | null;
  canUseManagedChat: boolean;
  managedChatAuthorityState: ManagedChatSurfaceAuthorityState;
  setStandaloneProjectChatId: (
    next: SetStateAction<string | null | undefined>,
  ) => void;
  setStandaloneSurfaceErrorCode: (errorCode: string | null) => void;
}) {
  if (isStandaloneProjectChatTarget(target)) {
    return (
      <StandaloneProjectChatSurface
        projectConfigId={projectConfigId}
        target={target}
        projectChatThreadTitle={projectChatThreadTitle}
        standaloneProjectChatId={standaloneProjectChatId}
        standaloneProjectChatThreadMissing={standaloneProjectChatThreadMissing}
        standaloneProjectChatThreadRouteInvalid={
          standaloneProjectChatThreadRouteInvalid
        }
        setStandaloneProjectChatId={setStandaloneProjectChatId}
        setStandaloneSurfaceErrorCode={setStandaloneSurfaceErrorCode}
      />
    );
  }
  if (target.kind === "section_not_found") {
    return (
      <StandaloneNotFoundSurface
        dataTestId="standalone-section-not-found"
        title="Section Not Found"
        description="No section matches this standalone route."
      />
    );
  }
  if (target.kind === "window_space_not_found") {
    return (
      <StandaloneNotFoundSurface
        dataTestId="standalone-window-space-not-found"
        title="Window Space Not Found"
        description="No saved window space matches this standalone route."
      />
    );
  }
  if (target.kind === "window_space") {
    return (
      <StandaloneWindowSpaceContent
        projectConfigId={projectConfigId}
        standaloneWindowSpace={standaloneWindowSpace}
        canUseManagedChat={canUseManagedChat}
        managedChatAuthorityState={managedChatAuthorityState}
      />
    );
  }
  return (
    <StandaloneSectionSurface
      projectConfigId={projectConfigId}
      target={target}
      setStandaloneSurfaceErrorCode={setStandaloneSurfaceErrorCode}
    />
  );
}

type StandaloneProjectSurfacePageLoadState = {
  doneLoading: boolean;
  is404: boolean;
};

export function StandaloneProjectSurfacePage() {
  const [doneLoading, is404] = useLoadProjectConfig();
  return (
    <StandaloneProjectSurfacePageWithLoadState
      doneLoading={doneLoading === true}
      is404={is404 === true}
    />
  );
}

export function StandaloneProjectSurfacePageWithLoadState({
  doneLoading,
  is404,
}: StandaloneProjectSurfacePageLoadState) {
  const { projectConfigName, sectionSlug, chatId, windowSpaceSlug } =
    useParams();
  const target = useProjectState(
    (state) =>
      resolveStandaloneSurfaceTarget(
        state,
        sectionSlug,
        chatId,
        windowSpaceSlug,
      ),
    shallow,
  );
  const projectConfigId = useProjectState((state) => state.projectConfig.id);
  const managedChatAuthorityState = useStandaloneManagedChatAuthorityState();
  const standaloneWindowSpace = useProjectState((state) => {
    if (target.kind !== "window_space") {
      return null;
    }
    return state.projectConfig.windowSpaces[target.windowSpaceId] ?? null;
  }, shallow);
  const { isDeploymentMode, allowLLM } = useShareSession(
    (state) => ({
      isDeploymentMode: state.isDeploymentMode,
      allowLLM: state.sharePolicy?.allowLLM ?? false,
    }),
    shallow,
  );
  const {
    projectChatThreadTitle,
    standaloneProjectChatId,
    standaloneProjectChatThreadRouteInvalid,
  } = useStandaloneProjectChatThreadInfo(target, projectConfigId);
  const canUseManagedChat = canUseManagedChatLLM({
    isDeploymentMode,
    allowLLM,
  });
  const standaloneSurfaceOwnerKey = buildStandaloneSurfaceOwnerKey(
    projectConfigId,
    target,
  );
  const { standaloneSurfaceErrorState, setStandaloneSurfaceErrorCode } =
    useStandaloneSurfaceErrorState(
      standaloneSurfaceOwnerKey,
      canUseManagedChat,
    );
  const standaloneProjectChatThreadMissing =
    target.kind === "project_chat_thread" &&
    standaloneSurfaceErrorState.ownerKey === standaloneSurfaceOwnerKey &&
    standaloneSurfaceErrorState.errorCode === "chat_not_found";
  const standaloneManagedChatDenied =
    standaloneSurfaceErrorState.ownerKey === standaloneSurfaceOwnerKey &&
    standaloneSurfaceErrorState.errorCode === "llm_disallowed";
  const shouldBlockStandaloneManagedChat =
    resolveShouldBlockStandaloneManagedChat({
      target,
      standaloneWindowSpace,
      managedChatAuthorityState,
      canUseManagedChat,
      standaloneManagedChatDenied,
    });
  const setStandaloneProjectChatId = useStandaloneProjectChatNavigation(
    projectConfigName,
    standaloneProjectChatId,
  );

  useCodeMirrorStyleLoader(doneLoading, is404);
  useAddMouseLocationListener();
  usePluginRuntimeBootstrap(doneLoading && !is404);

  useEffect(() => {
    document.title = resolveStandaloneDocumentTitle(
      projectConfigName,
      target,
      is404,
      standaloneProjectChatThreadMissing
        ? "Thread Not Found"
        : projectChatThreadTitle,
    );
  }, [
    is404,
    projectConfigName,
    projectChatThreadTitle,
    standaloneProjectChatThreadMissing,
    target,
  ]);

  if (!doneLoading) {
    return <LoadingSpinner />;
  }

  if (is404) {
    return <NotFound />;
  }

  if (shouldBlockStandaloneManagedChat) {
    return <StandaloneManagedChatBlockedSurface />;
  }

  return (
    <StandaloneSurfaceContent
      target={target}
      projectConfigId={projectConfigId}
      projectChatThreadTitle={projectChatThreadTitle}
      standaloneProjectChatId={standaloneProjectChatId}
      standaloneProjectChatThreadMissing={standaloneProjectChatThreadMissing}
      standaloneProjectChatThreadRouteInvalid={
        standaloneProjectChatThreadRouteInvalid
      }
      standaloneWindowSpace={standaloneWindowSpace}
      canUseManagedChat={canUseManagedChat}
      managedChatAuthorityState={managedChatAuthorityState}
      setStandaloneProjectChatId={setStandaloneProjectChatId}
      setStandaloneSurfaceErrorCode={setStandaloneSurfaceErrorCode}
    />
  );
}
