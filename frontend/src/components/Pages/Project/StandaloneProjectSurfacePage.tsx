import {
  canUseManagedChatLLM,
  standaloneSectionRequiresManagedChat,
  standaloneWindowSpaceRequiresManagedChat,
  type ManagedChatSurfaceAuthorityState,
} from "components/Chat/sharePolicyChatAccess";
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
import { useAddMouseLocationListener } from "forks/xyflow/core/utils/mouseLocation";
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
import { SectionTypeEnum, type SectionType } from "utils/generatedTypes";
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
  if (target.kind === "project_chat") {
    return `${projectConfigName} Chat`;
  }
  if (target.kind === "project_chat_thread") {
    if (projectChatThreadTitle) {
      return `${projectConfigName} · ${projectChatThreadTitle}`;
    }
    return `${projectConfigName} Chat`;
  }
  if (target.kind === "section") {
    return `${projectConfigName} · ${target.sectionName}`;
  }
  if (target.kind === "window_space") {
    return `${projectConfigName} · ${target.windowSpaceName}`;
  }
  if (target.kind === "window_space_not_found") {
    return `${projectConfigName} · Window Space Not Found`;
  }
  return `${projectConfigName} · Section Not Found`;
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
  const navigate = useNavigate();
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
  const managedChatAuthorityState = useMemo<ManagedChatSurfaceAuthorityState>(
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
  const projectChatThreadTitle =
    target.kind === "project_chat_thread"
      ? standaloneProjectChatThreadEntry?.label ??
        `Chat ${target.chatId.slice(0, 8)}`
      : null;
  const [
    standaloneProjectChatBlockedState,
    setStandaloneProjectChatBlockedState,
  ] = useState<{
    projectConfigId: string | null;
    chatId: string | null;
    errorCode: string | null;
  }>({
    projectConfigId: null,
    chatId: null,
    errorCode: null,
  });
  const [
    standaloneManagedChatBlockedState,
    setStandaloneManagedChatBlockedState,
  ] = useState<{
    surfaceIdentity: string | null;
    errorCode: string | null;
  }>({
    surfaceIdentity: null,
    errorCode: null,
  });
  const resolvedDoneLoading = doneLoading === true;
  const resolvedIs404 = is404 === true;
  const canUseManagedChat = canUseManagedChatLLM({
    isDeploymentMode,
    allowLLM,
  });
  const standaloneProjectChatId =
    target.kind === "project_chat_thread" ? target.chatId : null;
  const standaloneProjectChatThreadMissing =
    target.kind === "project_chat_thread" &&
    standaloneProjectChatBlockedState.projectConfigId === projectConfigId &&
    standaloneProjectChatBlockedState.chatId === standaloneProjectChatId &&
    standaloneProjectChatBlockedState.errorCode === "chat_not_found";
  const standaloneSurfaceIdentity =
    target.kind === "section"
      ? `section:${target.sectionId}`
      : target.kind === "window_space"
        ? `window-space:${target.windowSpaceId}`
        : target.kind;
  const standaloneTargetRequiresManagedChat =
    target.kind === "project_chat" || target.kind === "project_chat_thread"
      ? true
      : target.kind === "section"
        ? standaloneSectionRequiresManagedChat(
            managedChatAuthorityState,
            target.sectionId,
          )
        : target.kind === "window_space" && standaloneWindowSpace
          ? standaloneWindowSpaceRequiresManagedChat(
              standaloneWindowSpace,
              managedChatAuthorityState,
            )
          : false;
  const standaloneManagedChatDenied =
    standaloneManagedChatBlockedState.surfaceIdentity ===
      standaloneSurfaceIdentity &&
    standaloneManagedChatBlockedState.errorCode === "llm_disallowed";
  const shouldBlockStandaloneManagedChat =
    (!canUseManagedChat && standaloneTargetRequiresManagedChat) ||
    standaloneManagedChatDenied;
  const previousCanUseManagedChat = useRef(canUseManagedChat);

  const setStandaloneManagedChatBlockedErrorCode = (
    errorCode: string | null,
  ) => {
    const nextErrorCode = errorCode === "llm_disallowed" ? errorCode : null;
    setStandaloneManagedChatBlockedState((current) => {
      if (
        current.surfaceIdentity === standaloneSurfaceIdentity &&
        current.errorCode === nextErrorCode
      ) {
        return current;
      }
      return {
        surfaceIdentity: standaloneSurfaceIdentity,
        errorCode: nextErrorCode,
      };
    });
  };

  useEffect(() => {
    setStandaloneProjectChatBlockedState((current) => {
      if (
        current.projectConfigId === projectConfigId &&
        current.chatId === standaloneProjectChatId
      ) {
        return current;
      }
      return {
        projectConfigId,
        chatId: standaloneProjectChatId,
        errorCode: null,
      };
    });
  }, [projectConfigId, standaloneProjectChatId]);

  useEffect(() => {
    setStandaloneManagedChatBlockedState((current) => {
      if (current.surfaceIdentity === standaloneSurfaceIdentity) {
        return current;
      }
      return {
        surfaceIdentity: standaloneSurfaceIdentity,
        errorCode: null,
      };
    });
  }, [standaloneSurfaceIdentity]);

  useEffect(() => {
    if (!previousCanUseManagedChat.current && canUseManagedChat) {
      setStandaloneManagedChatBlockedState((current) => {
        if (current.errorCode !== "llm_disallowed") {
          return current;
        }
        return {
          surfaceIdentity: standaloneSurfaceIdentity,
          errorCode: null,
        };
      });
    }
    previousCanUseManagedChat.current = canUseManagedChat;
  }, [canUseManagedChat, standaloneSurfaceIdentity]);

  useCodeMirrorStyleLoader(resolvedDoneLoading, resolvedIs404);
  useAddMouseLocationListener();
  usePluginRuntimeBootstrap(resolvedDoneLoading && !resolvedIs404);
  const setStandaloneProjectChatId = (
    next: SetStateAction<string | null | undefined>,
  ) => {
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

  useEffect(() => {
    document.title = resolveStandaloneDocumentTitle(
      projectConfigName,
      target,
      resolvedIs404,
      standaloneProjectChatThreadMissing
        ? "Thread Not Found"
        : projectChatThreadTitle,
    );
  }, [
    resolvedIs404,
    projectConfigName,
    projectChatThreadTitle,
    standaloneProjectChatThreadMissing,
    target,
  ]);

  if (!resolvedDoneLoading) {
    return <LoadingSpinner />;
  }

  if (resolvedIs404) {
    return <NotFound />;
  }

  if (shouldBlockStandaloneManagedChat) {
    return <StandaloneManagedChatBlockedSurface />;
  }

  if (target.kind === "project_chat" || target.kind === "project_chat_thread") {
    if (standaloneProjectChatThreadMissing) {
      return (
        <StandaloneSurfaceShell>
          <div
            className="relative min-h-0 flex-1"
            data-testid="standalone-project-chat-thread-not-found"
          >
            <NotFound
              title="Thread Not Found"
              description="No project chat thread matches this standalone route."
            />
          </div>
        </StandaloneSurfaceShell>
      );
    }

    return (
      <StandaloneSurfaceShell>
        <UnifiedChatSurface
          mode="project_ai_mode"
          host="standalone_page"
          surfaceId={buildStandalonePageProjectChatSurfaceId(projectConfigId)}
          projectChatId={standaloneProjectChatId}
          setProjectChatId={setStandaloneProjectChatId}
          onProjectChatBlockedErrorCodeChange={(errorCode) => {
            setStandaloneProjectChatBlockedState((current) => {
              if (
                current.projectConfigId === projectConfigId &&
                current.chatId === standaloneProjectChatId &&
                current.errorCode === errorCode
              ) {
                return current;
              }
              return {
                projectConfigId,
                chatId: standaloneProjectChatId,
                errorCode,
              };
            });
            setStandaloneManagedChatBlockedErrorCode(errorCode);
          }}
          dataTestId={
            target.kind === "project_chat_thread"
              ? "standalone-project-chat-thread-surface"
              : "standalone-project-chat-surface"
          }
        />
      </StandaloneSurfaceShell>
    );
  }

  if (target.kind === "section_not_found") {
    return (
      <StandaloneSurfaceShell>
        <div
          className="relative min-h-0 flex-1"
          data-testid="standalone-section-not-found"
        >
          <NotFound
            title="Section Not Found"
            description="No section matches this standalone route."
          />
        </div>
      </StandaloneSurfaceShell>
    );
  }

  if (target.kind === "window_space_not_found") {
    return (
      <StandaloneSurfaceShell>
        <div
          className="relative min-h-0 flex-1"
          data-testid="standalone-window-space-not-found"
        >
          <NotFound
            title="Window Space Not Found"
            description="No saved window space matches this standalone route."
          />
        </div>
      </StandaloneSurfaceShell>
    );
  }

  if (target.kind === "window_space") {
    if (!standaloneWindowSpace) {
      return (
        <StandaloneSurfaceShell>
          <div
            className="relative min-h-0 flex-1"
            data-testid="standalone-window-space-not-found"
          >
            <NotFound
              title="Window Space Not Found"
              description="No saved window space matches this standalone route."
            />
          </div>
        </StandaloneSurfaceShell>
      );
    }
    return (
      <StandaloneSurfaceShell>
        <StandaloneWindowSpaceSurface
          key={`${projectConfigId}:${standaloneWindowSpace.id}`}
          windowSpace={standaloneWindowSpace}
          onProjectChatBlockedErrorCodeChange={
            setStandaloneManagedChatBlockedErrorCode
          }
        />
      </StandaloneSurfaceShell>
    );
  }

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
          onProjectChatBlockedErrorCodeChange={
            setStandaloneManagedChatBlockedErrorCode
          }
          bodyOverride={
            target.sectionType === SectionTypeEnum.Group ||
            target.sectionType === SectionTypeEnum.ListRoot ? (
              <StandaloneSectionBody
                sectionId={target.sectionId}
                sectionType={target.sectionType}
              />
            ) : undefined
          }
        />
      </div>
    </StandaloneSurfaceShell>
  );
}
