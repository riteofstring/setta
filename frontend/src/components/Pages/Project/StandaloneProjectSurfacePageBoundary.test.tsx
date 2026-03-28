import { renderToStaticMarkup } from "react-dom/server";
import { SectionTypeEnum, createWindowSpaceConfig } from "utils/generatedTypes";
import { describe, expect, it, vi } from "vitest";
import { StandaloneProjectSurfacePageBoundary } from "./StandaloneProjectSurfacePageBoundary";

vi.mock("../LoadingSpinner", () => ({
  LoadingSpinner: () => <div data-testid="mock-loading-spinner" />,
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

vi.mock("./StandaloneProjectSurfaceRouteBoundary", () => ({
  StandaloneManagedChatBlockedSurface: () => (
    <div data-testid="mock-standalone-managed-chat-blocked" />
  ),
  StandaloneProjectSurfaceRouteBoundary: ({
    projectConfigId,
    target,
    renderDictArea,
    standaloneProjectChatId,
  }: {
    projectConfigId: string;
    target: { kind: string };
    renderDictArea: unknown;
    standaloneProjectChatId: string | null;
  }) => (
    <div
      data-testid="mock-standalone-project-surface-route-boundary"
      data-project-config-id={projectConfigId}
      data-target-kind={target.kind}
      data-has-render-dict-area={String(Boolean(renderDictArea))}
      data-standalone-project-chat-id={standaloneProjectChatId ?? ""}
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

const renderDictArea = () => null;

function createBaseProps() {
  return {
    doneLoading: true,
    is404: false,
    shouldBlockStandaloneManagedChat: false,
    projectConfigId: "project-config-1",
    target: {
      kind: "section" as const,
      sectionId: "section-1",
      sectionName: "Language Server",
      sectionType: SectionTypeEnum.Group,
    },
    standaloneWindowSpace: createWindowSpaceConfig({
      id: "window-space-1",
      name: "Workspace",
    }),
    managedChatAuthorityState,
    canUseManagedChat: true,
    projectChatThreadTitle: null,
    standaloneProjectChatId: null,
    standaloneProjectChatThreadRouteInvalid: false,
    standaloneProjectChatThreadMissing: false,
    renderDictArea,
    setStandaloneProjectChatId: () => undefined,
    onProjectChatBlockedErrorCodeChange: () => undefined,
  };
}

describe("StandaloneProjectSurfacePageBoundary", () => {
  it("renders the loading spinner before the standalone page finishes loading", () => {
    const markup = renderToStaticMarkup(
      <StandaloneProjectSurfacePageBoundary
        {...createBaseProps()}
        doneLoading={false}
      />,
    );

    expect(markup).toContain('data-testid="mock-loading-spinner"');
    expect(markup).not.toContain(
      'data-testid="mock-standalone-project-surface-route-boundary"',
    );
  });

  it("renders the route-owned not found surface after a 404 load", () => {
    const markup = renderToStaticMarkup(
      <StandaloneProjectSurfacePageBoundary {...createBaseProps()} is404 />,
    );

    expect(markup).toContain('data-testid="mock-not-found"');
    expect(markup).toContain("Not Found");
    expect(markup).not.toContain('data-testid="mock-loading-spinner"');
  });

  it("fails closed through the shared managed-chat blocked surface", () => {
    const markup = renderToStaticMarkup(
      <StandaloneProjectSurfacePageBoundary
        {...createBaseProps()}
        shouldBlockStandaloneManagedChat
      />,
    );

    expect(markup).toContain(
      'data-testid="mock-standalone-managed-chat-blocked"',
    );
    expect(markup).not.toContain(
      'data-testid="mock-standalone-project-surface-route-boundary"',
    );
  });

  it("routes the loaded standalone page through the lifted route boundary", () => {
    const markup = renderToStaticMarkup(
      <StandaloneProjectSurfacePageBoundary
        {...createBaseProps()}
        target={{
          kind: "project_chat_thread",
          chatId: "chat-alpha",
        }}
        projectChatThreadTitle="Alpha Chat"
        standaloneProjectChatId="chat-alpha"
      />,
    );

    expect(markup).toContain(
      'data-testid="mock-standalone-project-surface-route-boundary"',
    );
    expect(markup).toContain('data-project-config-id="project-config-1"');
    expect(markup).toContain('data-target-kind="project_chat_thread"');
    expect(markup).toContain('data-has-render-dict-area="true"');
    expect(markup).toContain('data-standalone-project-chat-id="chat-alpha"');
  });
});
