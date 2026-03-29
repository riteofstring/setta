import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SectionTypeEnum, createWindowSpaceConfig } from "utils/generatedTypes";
import { describe, expect, it, vi } from "vitest";
import {
  StandaloneManagedChatBlockedSurface,
  StandaloneProjectSurfaceRouteBoundary,
} from "./StandaloneProjectSurfaceRouteBoundary";

vi.mock("components/ChatWindowing/ProjectChatWindowSurface", () => ({
  ProjectChatWindowSurface: ({
    children,
    title,
    roundedClassName,
  }: {
    children: ReactNode;
    title: string;
    roundedClassName: string;
  }) => (
    <div
      data-testid="mock-project-chat-window-surface"
      data-title={title}
      data-rounded-class-name={roundedClassName}
    >
      {children}
    </div>
  ),
}));

vi.mock("components/ChatWindowing/UnifiedChatSurface", () => ({
  UnifiedChatSurface: ({
    dataTestId,
    projectChatId,
    surfaceId,
    host,
  }: {
    dataTestId?: string;
    projectChatId?: string | null;
    surfaceId: string;
    host: string;
  }) => (
    <div
      data-testid={dataTestId ?? "mock-unified-chat-surface"}
      data-project-chat-id={projectChatId ?? ""}
      data-surface-id={surfaceId}
      data-host={host}
    />
  ),
}));

const mockStandaloneProjectSurfaceRouteSectionBoundary = vi.fn(
  ({
    projectConfigId,
    sectionId,
    sectionType,
    renderDictArea,
    renderCoreBody,
    renderNestedSections,
  }: {
    projectConfigId: string;
    sectionId: string;
    sectionType: string;
    renderDictArea?: unknown;
    renderCoreBody?: unknown;
    renderNestedSections?: unknown;
  }) => (
    <div
      data-testid="mock-standalone-project-surface-route-section-boundary"
      data-project-config-id={projectConfigId}
      data-section-id={sectionId}
      data-section-type={sectionType}
      data-has-render-dict-area={String(Boolean(renderDictArea))}
      data-has-render-core-body={String(Boolean(renderCoreBody))}
      data-has-render-nested-sections={String(Boolean(renderNestedSections))}
    />
  ),
);

vi.mock("./StandaloneProjectSurfaceRouteSectionBoundary", () => ({
  StandaloneProjectSurfaceRouteSectionBoundary: (props: {
    projectConfigId: string;
    sectionId: string;
    sectionType: string;
    renderDictArea?: unknown;
    renderCoreBody?: unknown;
    renderNestedSections?: unknown;
  }) => mockStandaloneProjectSurfaceRouteSectionBoundary(props),
}));

vi.mock("components/Utils/FloatingBox", () => ({
  FloatingBox: () => <div data-testid="mock-floating-box" />,
}));

vi.mock("forks/dnd-kit/SectionDndContext", () => ({
  SectionDndContext: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("../NotFound/NotFound", () => ({
  NotFound: ({
    title = "Not Found",
    description,
  }: {
    title?: string;
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
    canUseManagedChat,
  }: {
    windowSpace: { id: string };
    canUseManagedChat: boolean;
  }) => (
    <div
      data-testid="mock-standalone-window-space-surface"
      data-window-space-id={windowSpace.id}
      data-can-use-managed-chat={String(canUseManagedChat)}
    />
  ),
}));

const managedChatAuthorityState = {
  projectConfig: {
    sectionVariantMap: {},
  },
  sections: {},
  sectionVariants: {},
  sectionImpls: {},
};

const renderableManagedChatAuthorityState = {
  projectConfig: {
    sectionVariantMap: {
      "section-1": "variant-1",
    },
  },
  sections: {
    "section-1": {
      id: "section-1",
    },
  },
  sectionVariants: {
    "variant-1": {
      impl: "impl-1",
    },
  },
  sectionImpls: {
    "impl-1": {
      id: "impl-1",
    },
  },
};

const renderDictArea = () => null;
const renderCoreBody = () => null;
const renderNestedSections = () => null;

describe("StandaloneProjectSurfaceRouteBoundary", () => {
  it("routes standalone section targets through the lifted section surface boundary", () => {
    mockStandaloneProjectSurfaceRouteSectionBoundary.mockClear();
    const markup = renderToStaticMarkup(
      <StandaloneProjectSurfaceRouteBoundary
        projectConfigId="project-config-1"
        target={{
          kind: "section",
          sectionId: "section-1",
          sectionName: "Language Server",
          sectionType: SectionTypeEnum.Group,
        }}
        standaloneWindowSpace={null}
        managedChatAuthorityState={renderableManagedChatAuthorityState}
        canUseManagedChat
        projectChatThreadTitle={null}
        standaloneProjectChatId={null}
        standaloneProjectChatThreadRouteInvalid={false}
        standaloneProjectChatThreadMissing={false}
        renderDictArea={renderDictArea}
        renderCoreBody={renderCoreBody}
        renderNestedSections={renderNestedSections}
        setStandaloneProjectChatId={() => undefined}
        onProjectChatBlockedErrorCodeChange={() => undefined}
      />,
    );

    expect(markup).toContain('data-testid="standalone-project-surface-page"');
    expect(markup).toContain(
      'data-testid="mock-standalone-project-surface-route-section-boundary"',
    );
    expect(markup).toContain('data-project-config-id="project-config-1"');
    expect(markup).toContain('data-section-id="section-1"');
    expect(markup).toContain(`data-section-type="${SectionTypeEnum.Group}"`);
    expect(markup).toContain('data-has-render-dict-area="true"');
    expect(markup).toContain('data-has-render-core-body="true"');
    expect(markup).toContain('data-has-render-nested-sections="true"');
    expect(markup).toContain('data-testid="mock-floating-box"');
    expect(
      mockStandaloneProjectSurfaceRouteSectionBoundary.mock.calls[0]?.[0]
        ?.renderCoreBody,
    ).toBe(renderCoreBody);
    expect(
      mockStandaloneProjectSurfaceRouteSectionBoundary.mock.calls[0]?.[0]
        ?.renderNestedSections,
    ).toBe(renderNestedSections);
  });

  it("keeps standalone section routes on the loading shell until the section is renderable", () => {
    mockStandaloneProjectSurfaceRouteSectionBoundary.mockClear();
    const markup = renderToStaticMarkup(
      <StandaloneProjectSurfaceRouteBoundary
        projectConfigId="project-config-1"
        target={{
          kind: "section",
          sectionId: "section-1",
          sectionName: "Language Server",
          sectionType: SectionTypeEnum.Group,
        }}
        standaloneWindowSpace={null}
        managedChatAuthorityState={managedChatAuthorityState}
        canUseManagedChat
        projectChatThreadTitle={null}
        standaloneProjectChatId={null}
        standaloneProjectChatThreadRouteInvalid={false}
        standaloneProjectChatThreadMissing={false}
        renderDictArea={renderDictArea}
        renderCoreBody={renderCoreBody}
        renderNestedSections={renderNestedSections}
        setStandaloneProjectChatId={() => undefined}
        onProjectChatBlockedErrorCodeChange={() => undefined}
      />,
    );

    expect(markup).toContain('data-testid="standalone-project-surface-page"');
    expect(markup).toContain("gg-spinner");
    expect(markup).not.toContain(
      'data-testid="mock-standalone-project-surface-route-section-boundary"',
    );
    expect(
      mockStandaloneProjectSurfaceRouteSectionBoundary,
    ).not.toHaveBeenCalled();
  });

  it("routes standalone chat targets through the lifted project chat frame", () => {
    const markup = renderToStaticMarkup(
      <StandaloneProjectSurfaceRouteBoundary
        projectConfigId="project-config-1"
        target={{
          kind: "project_chat_thread",
          chatId: "chat-alpha",
        }}
        standaloneWindowSpace={null}
        managedChatAuthorityState={managedChatAuthorityState}
        canUseManagedChat
        projectChatThreadTitle="Alpha Chat"
        standaloneProjectChatId="chat-alpha"
        standaloneProjectChatThreadRouteInvalid={false}
        standaloneProjectChatThreadMissing={false}
        renderDictArea={renderDictArea}
        renderCoreBody={renderCoreBody}
        renderNestedSections={renderNestedSections}
        setStandaloneProjectChatId={() => undefined}
        onProjectChatBlockedErrorCodeChange={() => undefined}
      />,
    );

    expect(markup).toContain('data-testid="mock-project-chat-window-surface"');
    expect(markup).toContain('data-title="Alpha Chat"');
    expect(markup).toContain(
      'data-testid="standalone-project-chat-thread-surface"',
    );
    expect(markup).toContain('data-project-chat-id="chat-alpha"');
    expect(markup).toContain('data-host="standalone_page"');
  });

  it("routes standalone window-space targets through the lifted window-space surface", () => {
    const markup = renderToStaticMarkup(
      <StandaloneProjectSurfaceRouteBoundary
        projectConfigId="project-config-1"
        target={{
          kind: "window_space",
          windowSpaceId: "window-space-1",
          windowSpaceName: "Workspace",
        }}
        standaloneWindowSpace={createWindowSpaceConfig({
          id: "window-space-1",
          name: "Workspace",
        })}
        managedChatAuthorityState={managedChatAuthorityState}
        canUseManagedChat={false}
        projectChatThreadTitle={null}
        standaloneProjectChatId={null}
        standaloneProjectChatThreadRouteInvalid={false}
        standaloneProjectChatThreadMissing={false}
        renderDictArea={renderDictArea}
        renderCoreBody={renderCoreBody}
        renderNestedSections={renderNestedSections}
        setStandaloneProjectChatId={() => undefined}
        onProjectChatBlockedErrorCodeChange={() => undefined}
      />,
    );

    expect(markup).toContain(
      'data-testid="mock-standalone-window-space-surface"',
    );
    expect(markup).toContain('data-window-space-id="window-space-1"');
    expect(markup).toContain('data-can-use-managed-chat="false"');
  });

  it("renders the route-owned not-found state for invalid standalone chat threads", () => {
    const markup = renderToStaticMarkup(
      <StandaloneProjectSurfaceRouteBoundary
        projectConfigId="project-config-1"
        target={{
          kind: "project_chat_thread_not_found",
        }}
        standaloneWindowSpace={null}
        managedChatAuthorityState={managedChatAuthorityState}
        canUseManagedChat
        projectChatThreadTitle={null}
        standaloneProjectChatId={null}
        standaloneProjectChatThreadRouteInvalid
        standaloneProjectChatThreadMissing={false}
        renderDictArea={renderDictArea}
        renderCoreBody={renderCoreBody}
        renderNestedSections={renderNestedSections}
        setStandaloneProjectChatId={() => undefined}
        onProjectChatBlockedErrorCodeChange={() => undefined}
      />,
    );

    expect(markup).toContain(
      'data-testid="standalone-project-chat-thread-not-found"',
    );
    expect(markup).toContain('data-testid="mock-not-found"');
    expect(markup).toContain("Thread Not Found");
    expect(markup).toContain("This standalone project chat route is invalid.");
  });
});

describe("StandaloneManagedChatBlockedSurface", () => {
  it("renders the shared blocked surface inside the standalone surface shell", () => {
    const markup = renderToStaticMarkup(
      <StandaloneManagedChatBlockedSurface />,
    );

    expect(markup).toContain('data-testid="standalone-project-surface-page"');
    expect(markup).toContain('data-testid="standalone-managed-chat-blocked"');
    expect(markup).toContain('data-testid="mock-not-found"');
    expect(markup).toContain("Managed Chat Unavailable");
  });
});
