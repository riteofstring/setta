import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MainContainerCore } from "./MainContainerCore";

let isPreviewEnabled = false;

vi.mock("components/Section/Container/SectionContainerBoundary", () => ({
  SectionContainerBoundary: ({ sectionId }: { sectionId: string }) => (
    <div
      data-testid="mock-section-container-boundary"
      data-section-id={sectionId}
    />
  ),
}));

vi.mock("components/ChatWindowing/ProjectChatBottomDock", () => ({
  ProjectChatBottomDock: () => (
    <div data-testid="mock-project-chat-bottom-dock" />
  ),
}));

vi.mock("components/Git/GitOverlayLayer", () => ({
  GitOverlayLayer: () => <div data-testid="mock-git-overlay-layer" />,
}));

vi.mock("components/Panes/Overview/Overview", () => ({
  Overview: () => <div data-testid="mock-overview" />,
}));

vi.mock("components/Panes/UiEditor/UiEditor", () => ({
  UiEditor: () => <div data-testid="mock-ui-editor" />,
}));

vi.mock("components/Utils/CodeMirror/useCodeMirrorStyleLoader", () => ({
  useCodeMirrorStyleLoader: () => {},
}));

vi.mock("components/Utils/FloatingBox", () => ({
  FloatingBox: () => <div data-testid="mock-floating-box" />,
}));

vi.mock("components/Utils/GridWrapper", () => ({
  GridWrapper: ({ children }: { children: ReactNode }) => (
    <div data-testid="mock-grid-wrapper">{children}</div>
  ),
}));

vi.mock("forks/xyflow/core/utils/mouseLocation", () => ({
  useAddMouseLocationListener: () => {},
}));

vi.mock("plugins/runtime", () => ({
  usePluginRuntimeBootstrap: () => {},
}));

vi.mock("state/definitions", () => ({
  useAppPreview: (
    selector: (state: { isPreviewEnabled: boolean }) => unknown,
  ) => selector({ isPreviewEnabled }),
}));

vi.mock("state/hooks/aiFollow", () => ({
  useAIFollowViewport: () => {},
  useAIFollowZIndexBoost: () => {},
}));

vi.mock("state/hooks/viewModeUrl", () => ({
  useViewModeUrlSync: () => {},
}));

vi.mock("./LoadingSpinner", () => ({
  LoadingSpinner: () => <div data-testid="mock-loading-spinner" />,
}));

vi.mock("./NotFound/NotFound", () => ({
  NotFound: () => <div data-testid="mock-not-found" />,
}));

vi.mock("./Project/AppPreview", () => ({
  AppPreview: () => <div data-testid="mock-app-preview" />,
}));

vi.mock("./Project/UiPage", () => ({
  UIPage: ({
    SectionBoundary,
  }: {
    SectionBoundary: ({ sectionId }: { sectionId: string }) => ReactNode;
  }) => (
    <div data-testid="mock-ui-page">
      <SectionBoundary sectionId="section-a" />
    </div>
  ),
}));

vi.mock("./Project/ViewModeTabs", () => ({
  ViewModeTabs: () => <div data-testid="mock-view-mode-tabs" />,
}));

describe("MainContainerCore", () => {
  beforeEach(() => {
    isPreviewEnabled = false;
  });

  it("renders the loading spinner before the project surface loads", () => {
    const markup = renderToStaticMarkup(
      <MainContainerCore doneLoading={false} is404={false} />,
    );

    expect(markup).toContain('data-testid="mock-loading-spinner"');
    expect(markup).not.toContain('data-testid="mock-ui-page"');
  });

  it("renders the not-found surface for missing projects", () => {
    const markup = renderToStaticMarkup(
      <MainContainerCore doneLoading is404 />,
    );

    expect(markup).toContain('data-testid="mock-not-found"');
    expect(markup).not.toContain('data-testid="mock-ui-page"');
  });

  it("owns the lifted top-level section boundary above UIPage", () => {
    const markup = renderToStaticMarkup(
      <MainContainerCore doneLoading is404={false} />,
    );

    expect(markup).toContain('data-testid="mock-overview"');
    expect(markup).toContain('data-testid="mock-ui-editor"');
    expect(markup).toContain('data-testid="mock-grid-wrapper"');
    expect(markup).toContain('data-testid="mock-ui-page"');
    expect(markup).toContain('data-testid="mock-section-container-boundary"');
    expect(markup).toContain('data-section-id="section-a"');
    expect(markup).toContain('data-testid="mock-project-chat-bottom-dock"');
    expect(markup).toContain('data-testid="mock-view-mode-tabs"');
    expect(markup).toContain('data-testid="mock-git-overlay-layer"');
    expect(markup).toContain('data-testid="mock-floating-box"');
    expect(markup).not.toContain('data-testid="mock-app-preview"');
  });

  it("keeps the app preview branch intact when preview mode is enabled", () => {
    isPreviewEnabled = true;

    const markup = renderToStaticMarkup(
      <MainContainerCore doneLoading is404={false} />,
    );

    expect(markup).toContain('data-testid="mock-app-preview"');
    expect(markup).not.toContain('data-testid="mock-ui-page"');
  });
});
