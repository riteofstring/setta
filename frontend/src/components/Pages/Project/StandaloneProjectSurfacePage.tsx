import { UnifiedChatSurface } from "components/ChatWindowing/UnifiedChatSurface";
import { MaybeManyNestedSections } from "components/Section/Container/ManyNestedSections";
import { SectionWindowSurface } from "components/Section/Container/SectionWindowSurface";
import { useCodeMirrorStyleLoader } from "components/Utils/CodeMirror/useCodeMirrorStyleLoader";
import { FloatingBox } from "components/Utils/FloatingBox";
import { SectionDndContext } from "forks/dnd-kit/SectionDndContext";
import { useAddMouseLocationListener } from "forks/xyflow/core/utils/mouseLocation";
import { usePluginRuntimeBootstrap } from "plugins/runtime";
import { useEffect, useMemo } from "react";
import { useParams } from "react-router-dom";
import { buildChatHistoryEntries } from "state/actions/chatHistory";
import { useAIStore, useProjectState } from "state/definitions";
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

function normalizeStandaloneChatId(chatId: string | undefined): string | null {
  const normalizedChatId = chatId?.trim() ?? "";
  if (!normalizedChatId) {
    return null;
  }
  return normalizedChatId;
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

export function StandaloneProjectSurfacePage() {
  const [doneLoading, is404] = useLoadProjectConfig();
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
  const standaloneWindowSpace = useProjectState((state) => {
    if (target.kind !== "window_space") {
      return null;
    }
    return state.projectConfig.windowSpaces?.[target.windowSpaceId] ?? null;
  }, shallow);
  const { activeChatId, agentRuns, agentRunsAuthorityState } = useAIStore(
    (state) => ({
      activeChatId: state.activeChatId,
      agentRuns: state.agentRuns,
      agentRunsAuthorityState: state.agentRunsAuthorityState,
    }),
    shallow,
  );
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
  const standaloneProjectChatThreadMissing =
    target.kind === "project_chat_thread" &&
    agentRunsAuthorityState === "ready" &&
    standaloneProjectChatThreadEntry === null;
  const standaloneProjectChatThreadSyncPending =
    target.kind === "project_chat_thread" && activeChatId !== target.chatId;

  useCodeMirrorStyleLoader(doneLoading, is404);
  useAddMouseLocationListener();
  usePluginRuntimeBootstrap(doneLoading && !is404);

  useEffect(() => {
    if (target.kind !== "project_chat_thread") {
      return;
    }
    if (activeChatId === target.chatId) {
      return;
    }
    useAIStore.setState({ activeChatId: target.chatId });
  }, [activeChatId, target]);

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

    if (standaloneProjectChatThreadSyncPending) {
      return <LoadingSpinner />;
    }

    return (
      <StandaloneSurfaceShell>
        <UnifiedChatSurface
          mode="project_ai_mode"
          host="standalone_page"
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
        <StandaloneWindowSpaceSurface windowSpace={standaloneWindowSpace} />
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
