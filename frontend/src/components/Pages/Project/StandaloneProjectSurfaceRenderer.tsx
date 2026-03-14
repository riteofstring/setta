import { type ManagedChatSurfaceAuthorityState } from "components/Chat/sharePolicyChatAccess";
import { UnifiedChatSurface } from "components/ChatWindowing/UnifiedChatSurface";
import {
  buildStandalonePageProjectChatSurfaceId,
  buildStandalonePageSectionProjectChatSurfaceId,
} from "components/ChatWindowing/projectChatSurfaceIds";
import { MaybeManyNestedSections } from "components/Section/Container/ManyNestedSections";
import { SectionWindowSurface } from "components/Section/Container/SectionWindowSurface";
import { FloatingBox } from "components/Utils/FloatingBox";
import { SectionDndContext } from "forks/dnd-kit/SectionDndContext";
import { type ReactNode, type SetStateAction } from "react";
import {
  SectionTypeEnum,
  type SectionType,
  type WindowSpaceConfig,
} from "utils/generatedTypes";
import { NotFound } from "../NotFound/NotFound";
import { StandaloneWindowSpaceSurface } from "./StandaloneWindowSpaceSurface";
import { type StandaloneSurfaceTarget } from "./standaloneProjectSurfaceRouting";

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

function StandaloneSurfaceShell({ children }: { children: ReactNode }) {
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

function StandaloneNotFoundSurface({
  dataTestId,
  title,
  description,
}: {
  dataTestId: string;
  title: string;
  description: string;
}) {
  return (
    <StandaloneSurfaceShell>
      <div className="relative min-h-0 flex-1" data-testid={dataTestId}>
        <NotFound title={title} description={description} />
      </div>
    </StandaloneSurfaceShell>
  );
}

function StandaloneManagedChatBlockedSurface() {
  return (
    <StandaloneNotFoundSurface
      dataTestId="standalone-managed-chat-blocked"
      title="Managed Chat Unavailable"
      description="This deployment does not allow LLM access for standalone managed chat surfaces."
    />
  );
}

export function StandaloneProjectSurfaceRenderer({
  target,
  projectConfigId,
  standaloneProjectChatId,
  standaloneProjectChatThreadRouteInvalid,
  standaloneProjectChatThreadMissing,
  shouldBlockStandaloneManagedChat,
  standaloneWindowSpace,
  canUseManagedChat,
  managedChatAuthorityState,
  setStandaloneProjectChatId,
  setStandaloneSurfaceErrorCode,
}: {
  target: StandaloneSurfaceTarget;
  projectConfigId: string;
  standaloneProjectChatId: string | null;
  standaloneProjectChatThreadRouteInvalid: boolean;
  standaloneProjectChatThreadMissing: boolean;
  shouldBlockStandaloneManagedChat: boolean;
  standaloneWindowSpace: WindowSpaceConfig | null;
  canUseManagedChat: boolean;
  managedChatAuthorityState: ManagedChatSurfaceAuthorityState;
  setStandaloneProjectChatId: (
    next: SetStateAction<string | null | undefined>,
  ) => void;
  setStandaloneSurfaceErrorCode: (errorCode: string | null) => void;
}) {
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
        <StandaloneNotFoundSurface
          dataTestId="standalone-project-chat-thread-not-found"
          title="Thread Not Found"
          description={
            standaloneProjectChatThreadRouteInvalid
              ? "This standalone project chat route is invalid."
              : "No project chat thread matches this standalone route."
          }
        />
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
