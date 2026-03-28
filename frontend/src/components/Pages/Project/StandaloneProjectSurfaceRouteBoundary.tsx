import { type ManagedChatSurfaceAuthorityState } from "components/Chat/sharePolicyChatAccess";
import { ProjectChatWindowSurface } from "components/ChatWindowing/ProjectChatWindowSurface";
import { UnifiedChatSurface } from "components/ChatWindowing/UnifiedChatSurface";
import {
  buildStandalonePageProjectChatSurfaceId,
  buildStandalonePageSectionProjectChatSurfaceId,
} from "components/ChatWindowing/projectChatSurfaceIds";
import { StandaloneSectionSurfaceBoundary } from "components/Section/Container/StandaloneSectionSurfaceBoundary";
import type { SectionContainerAreaDictProps } from "components/Section/Container/sectionContainerAreaView";
import { FloatingBox } from "components/Utils/FloatingBox";
import { SectionDndContext } from "forks/dnd-kit/SectionDndContext";
import {
  memo,
  type ComponentProps,
  type ReactNode,
  type SetStateAction,
} from "react";
import {
  ChatWindowModeEnum,
  type SectionType,
  type WindowSpaceConfig,
} from "utils/generatedTypes";
import { NotFound } from "../NotFound/NotFound";
import { StandaloneWindowSpaceSurface } from "./StandaloneWindowSpaceSurface";

export type StandaloneSurfaceTarget =
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

export type StandaloneSurfaceErrorCode = "chat_not_found" | "llm_disallowed";

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

export function StandaloneManagedChatBlockedSurface() {
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

type StandaloneProjectSurfaceRouteBoundaryProps = {
  projectConfigId: string;
  target: StandaloneSurfaceTarget;
  standaloneWindowSpace: WindowSpaceConfig | null;
  managedChatAuthorityState: ManagedChatSurfaceAuthorityState;
  canUseManagedChat: boolean;
  projectChatThreadTitle: string | null;
  standaloneProjectChatId: string | null;
  standaloneProjectChatThreadRouteInvalid: boolean;
  standaloneProjectChatThreadMissing: boolean;
  renderDictArea: (props: SectionContainerAreaDictProps) => ReactNode;
  renderCoreBody: ComponentProps<
    typeof StandaloneSectionSurfaceBoundary
  >["renderCoreBody"];
  renderNestedSections: ComponentProps<
    typeof StandaloneSectionSurfaceBoundary
  >["renderNestedSections"];
  setStandaloneProjectChatId: (
    next: SetStateAction<string | null | undefined>,
  ) => void;
  onProjectChatBlockedErrorCodeChange: (errorCode: string | null) => void;
};

function _StandaloneProjectSurfaceRouteBoundary({
  projectConfigId,
  target,
  standaloneWindowSpace,
  managedChatAuthorityState,
  canUseManagedChat,
  projectChatThreadTitle,
  standaloneProjectChatId,
  standaloneProjectChatThreadRouteInvalid,
  standaloneProjectChatThreadMissing,
  renderDictArea,
  renderCoreBody,
  renderNestedSections,
  setStandaloneProjectChatId,
  onProjectChatBlockedErrorCodeChange,
}: StandaloneProjectSurfaceRouteBoundaryProps) {
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
        <ProjectChatWindowSurface
          title={projectChatThreadTitle ?? "Project AI Chat"}
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
            projectChatId={standaloneProjectChatId}
            setProjectChatId={setStandaloneProjectChatId}
            onProjectChatBlockedErrorCodeChange={
              onProjectChatBlockedErrorCodeChange
            }
            dataTestId={
              target.kind === "project_chat_thread"
                ? "standalone-project-chat-thread-surface"
                : "standalone-project-chat-surface"
            }
          />
        </ProjectChatWindowSurface>
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
        <StandaloneSectionSurfaceBoundary
          sectionId={target.sectionId}
          sectionType={target.sectionType}
          projectChatSurfaceId={buildStandalonePageSectionProjectChatSurfaceId(
            projectConfigId,
            target.sectionId,
          )}
          onProjectChatBlockedErrorCodeChange={
            onProjectChatBlockedErrorCodeChange
          }
          renderDictArea={renderDictArea}
          renderCoreBody={renderCoreBody}
          renderNestedSections={renderNestedSections}
        />
      </div>
    </StandaloneSurfaceShell>
  );
}

export const StandaloneProjectSurfaceRouteBoundary = memo(
  _StandaloneProjectSurfaceRouteBoundary,
);
