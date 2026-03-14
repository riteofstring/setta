import { canUseManagedChatLLM } from "components/Chat/sharePolicyChatAccess";
import { UnifiedChatSurface } from "components/ChatWindowing/UnifiedChatSurface";
import {
  buildStandalonePageProjectChatSurfaceId,
  buildStandalonePageSectionProjectChatSurfaceId,
} from "components/ChatWindowing/projectChatSurfaceIds";
import { MaybeManyNestedSections } from "components/Section/Container/ManyNestedSections";
import { SectionWindowSurface } from "components/Section/Container/SectionWindowSurface";
import { FloatingBox } from "components/Utils/FloatingBox";
import { SectionDndContext } from "forks/dnd-kit/SectionDndContext";
import { useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { buildChatHistoryEntries } from "state/actions/chatHistory";
import { useProjectState, useShareSession } from "state/definitions";
import { useLoadProjectConfig } from "state/hooks/project";
import { useAIStore } from "state/stores/aiStore";
import { SectionTypeEnum, type SectionType } from "utils/generatedTypes";
import { shallow } from "zustand/shallow";
import { LoadingSpinner } from "../LoadingSpinner";
import { NotFound } from "../NotFound/NotFound";
import { StandaloneWindowSpaceSurface } from "./StandaloneWindowSpaceSurface";
import { useStandaloneProjectSurfaceController } from "./standaloneProjectSurfaceController";
import {
  buildStandaloneSurfaceOwnerKey,
  resolveStandaloneDocumentTitle,
  resolveStandaloneSurfaceTarget,
} from "./standaloneProjectSurfaceRouting";
import {
  buildStandaloneManagedChatAuthorityState,
  resolveStandaloneManagedChatGuardState,
  resolveStandaloneProjectChatThreadTitle,
} from "./standaloneProjectSurfaceViewModel";

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
  const managedChatAuthorityState = useMemo(
    () =>
      buildStandaloneManagedChatAuthorityState({
        sections,
        sectionVariants,
        sectionImpls,
        sectionVariantMap,
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
  const projectChatThreadTitle = useMemo(
    () =>
      resolveStandaloneProjectChatThreadTitle({
        target,
        projectChatHistoryEntries,
      }),
    [projectChatHistoryEntries, target],
  );
  const resolvedDoneLoading = doneLoading === true;
  const resolvedIs404 = is404 === true;
  const canUseManagedChat = canUseManagedChatLLM({
    isDeploymentMode,
    allowLLM,
  });
  const standaloneSurfaceOwnerKey = buildStandaloneSurfaceOwnerKey(
    projectConfigId,
    target,
  );
  const routeStandaloneProjectChatId =
    target.kind === "project_chat_thread" ? target.chatId : null;
  const {
    standaloneSurfaceErrorState,
    setStandaloneSurfaceErrorCode,
    setStandaloneProjectChatId,
  } = useStandaloneProjectSurfaceController({
    projectConfigName,
    doneLoading: resolvedDoneLoading,
    is404: resolvedIs404,
    canUseManagedChat,
    standaloneSurfaceOwnerKey,
    standaloneProjectChatId: routeStandaloneProjectChatId,
    navigate,
  });
  const {
    standaloneProjectChatId,
    standaloneProjectChatThreadRouteInvalid,
    standaloneProjectChatThreadMissing,
    shouldBlockStandaloneManagedChat,
  } = useMemo(
    () =>
      resolveStandaloneManagedChatGuardState({
        target,
        standaloneSurfaceErrorState,
        standaloneSurfaceOwnerKey,
        managedChatAuthorityState,
        standaloneWindowSpace,
        canUseManagedChat,
      }),
    [
      canUseManagedChat,
      managedChatAuthorityState,
      standaloneSurfaceErrorState,
      standaloneSurfaceOwnerKey,
      standaloneWindowSpace,
      target,
    ],
  );

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

  if (
    target.kind === "project_chat" ||
    target.kind === "project_chat_thread" ||
    target.kind === "project_chat_thread_not_found"
  ) {
    if (
      standaloneProjectChatThreadRouteInvalid ||
      standaloneProjectChatThreadMissing
    ) {
      return (
        <StandaloneSurfaceShell>
          <div
            className="relative min-h-0 flex-1"
            data-testid="standalone-project-chat-thread-not-found"
          >
            <NotFound
              title="Thread Not Found"
              description={
                standaloneProjectChatThreadRouteInvalid
                  ? "This standalone project chat route is invalid."
                  : "No project chat thread matches this standalone route."
              }
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
          onProjectChatBlockedErrorCodeChange={setStandaloneSurfaceErrorCode}
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
          canUseManagedChat={canUseManagedChat}
          managedChatAuthorityState={managedChatAuthorityState}
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
          onProjectChatBlockedErrorCodeChange={setStandaloneSurfaceErrorCode}
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
