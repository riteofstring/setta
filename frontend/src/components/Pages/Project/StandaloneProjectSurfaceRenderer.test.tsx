import { type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  SectionTypeEnum,
  createWindowSpaceConfig,
  type WindowSpaceConfig,
} from "utils/generatedTypes";
import { describe, expect, it, vi } from "vitest";
import { StandaloneProjectSurfaceRenderer } from "./StandaloneProjectSurfaceRenderer";

vi.mock("components/ChatWindowing/UnifiedChatSurface", () => ({
  UnifiedChatSurface: ({
    dataTestId,
    projectChatId,
  }: {
    dataTestId?: string;
    projectChatId?: string | null;
  }) => (
    <div
      data-testid={dataTestId ?? "mock-unified-chat-surface"}
      data-project-chat-id={projectChatId ?? ""}
    />
  ),
}));

vi.mock("components/Section/Container/ManyNestedSections", () => ({
  MaybeManyNestedSections: () => (
    <div data-testid="mock-many-nested-sections" />
  ),
}));

vi.mock("components/Section/Container/SectionWindowSurface", () => ({
  SectionWindowSurface: ({ bodyOverride }: { bodyOverride?: ReactNode }) => (
    <div
      data-testid="mock-section-window-surface"
      data-has-body-override={bodyOverride ? "true" : "false"}
    />
  ),
}));

vi.mock("components/Utils/FloatingBox", () => ({
  FloatingBox: () => <div data-testid="mock-floating-box" />,
}));

vi.mock("forks/dnd-kit/SectionDndContext", () => ({
  SectionDndContext: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("../NotFound/NotFound", () => ({
  NotFound: ({
    title,
    description,
  }: {
    title: string;
    description?: string;
  }) => (
    <div data-testid="mock-not-found">
      <h1>{title}</h1>
      {description ? <p>{description}</p> : null}
    </div>
  ),
}));

vi.mock("./StandaloneWindowSpaceSurface", () => ({
  StandaloneWindowSpaceSurface: ({
    windowSpace,
  }: {
    windowSpace: WindowSpaceConfig;
  }) => (
    <div
      data-testid="mock-standalone-window-space-surface"
      data-window-space-id={windowSpace.id}
    />
  ),
}));

function createManagedChatAuthorityState() {
  return {
    projectConfig: {
      sectionVariantMap: {},
    },
    sections: {},
    sectionVariants: {},
    sectionImpls: {},
  };
}

describe("StandaloneProjectSurfaceRenderer", () => {
  it("renders the managed-chat blocked surface when access is denied", () => {
    const markup = renderToStaticMarkup(
      <StandaloneProjectSurfaceRenderer
        target={{ kind: "project_chat" }}
        projectConfigId="project-1"
        standaloneProjectChatId={null}
        standaloneProjectChatThreadRouteInvalid={false}
        standaloneProjectChatThreadMissing={false}
        shouldBlockStandaloneManagedChat={true}
        standaloneWindowSpace={null}
        canUseManagedChat={false}
        managedChatAuthorityState={createManagedChatAuthorityState()}
        setStandaloneProjectChatId={() => undefined}
        setStandaloneSurfaceErrorCode={() => undefined}
      />,
    );

    expect(markup).toContain('data-testid="standalone-managed-chat-blocked"');
    expect(markup).toContain("Managed Chat Unavailable");
  });

  it("renders the standalone chat not-found branch for invalid thread routes", () => {
    const markup = renderToStaticMarkup(
      <StandaloneProjectSurfaceRenderer
        target={{ kind: "project_chat_thread_not_found" }}
        projectConfigId="project-1"
        standaloneProjectChatId={null}
        standaloneProjectChatThreadRouteInvalid={true}
        standaloneProjectChatThreadMissing={false}
        shouldBlockStandaloneManagedChat={false}
        standaloneWindowSpace={null}
        canUseManagedChat={true}
        managedChatAuthorityState={createManagedChatAuthorityState()}
        setStandaloneProjectChatId={() => undefined}
        setStandaloneSurfaceErrorCode={() => undefined}
      />,
    );

    expect(markup).toContain(
      'data-testid="standalone-project-chat-thread-not-found"',
    );
    expect(markup).toContain("This standalone project chat route is invalid.");
  });

  it("renders the standalone thread surface when a thread target is valid", () => {
    const markup = renderToStaticMarkup(
      <StandaloneProjectSurfaceRenderer
        target={{ kind: "project_chat_thread", chatId: "chat-alpha" }}
        projectConfigId="project-1"
        standaloneProjectChatId="chat-alpha"
        standaloneProjectChatThreadRouteInvalid={false}
        standaloneProjectChatThreadMissing={false}
        shouldBlockStandaloneManagedChat={false}
        standaloneWindowSpace={null}
        canUseManagedChat={true}
        managedChatAuthorityState={createManagedChatAuthorityState()}
        setStandaloneProjectChatId={() => undefined}
        setStandaloneSurfaceErrorCode={() => undefined}
      />,
    );

    expect(markup).toContain(
      'data-testid="standalone-project-chat-thread-surface"',
    );
    expect(markup).toContain('data-project-chat-id="chat-alpha"');
  });

  it("renders the standalone window-space surface when the window space exists", () => {
    const markup = renderToStaticMarkup(
      <StandaloneProjectSurfaceRenderer
        target={{
          kind: "window_space",
          windowSpaceId: "space-1",
          windowSpaceName: "Research Board",
        }}
        projectConfigId="project-1"
        standaloneProjectChatId={null}
        standaloneProjectChatThreadRouteInvalid={false}
        standaloneProjectChatThreadMissing={false}
        shouldBlockStandaloneManagedChat={false}
        standaloneWindowSpace={createWindowSpaceConfig({
          id: "space-1",
          name: "Research Board",
        })}
        canUseManagedChat={true}
        managedChatAuthorityState={createManagedChatAuthorityState()}
        setStandaloneProjectChatId={() => undefined}
        setStandaloneSurfaceErrorCode={() => undefined}
      />,
    );

    expect(markup).toContain(
      'data-testid="mock-standalone-window-space-surface"',
    );
    expect(markup).toContain('data-window-space-id="space-1"');
  });

  it("renders the section surface and body override for group sections", () => {
    const markup = renderToStaticMarkup(
      <StandaloneProjectSurfaceRenderer
        target={{
          kind: "section",
          sectionId: "section-1",
          sectionName: "Group Section",
          sectionType: SectionTypeEnum.Group,
        }}
        projectConfigId="project-1"
        standaloneProjectChatId={null}
        standaloneProjectChatThreadRouteInvalid={false}
        standaloneProjectChatThreadMissing={false}
        shouldBlockStandaloneManagedChat={false}
        standaloneWindowSpace={null}
        canUseManagedChat={true}
        managedChatAuthorityState={createManagedChatAuthorityState()}
        setStandaloneProjectChatId={() => undefined}
        setStandaloneSurfaceErrorCode={() => undefined}
      />,
    );

    expect(markup).toContain('data-testid="standalone-section-surface"');
    expect(markup).toContain('data-has-body-override="true"');
  });
});
