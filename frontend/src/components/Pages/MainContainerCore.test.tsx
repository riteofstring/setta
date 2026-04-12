/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MainContainerCore } from "./MainContainerCore";

vi.mock("components/ChatWindowing/ProjectChatBottomDock", () => ({
  ProjectChatBottomDock: () => <div data-testid="project-chat-bottom-dock" />,
}));

vi.mock("components/Git/GitOverlayLayer", () => ({
  GitOverlayLayer: () => <div data-testid="git-overlay-layer" />,
}));

vi.mock("components/Panes/Overview/Overview", () => ({
  Overview: () => <div data-testid="overview-pane" />,
}));

vi.mock("components/Panes/UiEditor/UiEditor", () => ({
  UiEditor: () => <div data-testid="ui-editor-pane" />,
}));

vi.mock("components/Utils/CodeMirror/useCodeMirrorStyleLoader", () => ({
  useCodeMirrorStyleLoader: vi.fn(),
}));

vi.mock("components/Utils/FloatingBox", () => ({
  FloatingBox: () => <div data-testid="floating-box" />,
}));

vi.mock("components/Utils/GridWrapper", () => ({
  GridWrapper: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="grid-wrapper">{children}</div>
  ),
}));

vi.mock("forks/xyflow/core/utils/mouseLocation", () => ({
  useAddMouseLocationListener: vi.fn(),
}));

vi.mock("plugins/runtime", () => ({
  usePluginRuntimeBootstrap: vi.fn(),
}));

vi.mock("state/definitions", () => ({
  useAppPreview: vi.fn(() => false),
}));

vi.mock("state/hooks/aiFollow", () => ({
  useAIFollowViewport: vi.fn(),
  useAIFollowZIndexBoost: vi.fn(),
}));

vi.mock("state/hooks/viewModeUrl", () => ({
  useViewModeUrlSync: vi.fn(),
}));

vi.mock("./LoadingSpinner", () => ({
  LoadingSpinner: () => <div data-testid="legacy-loading-spinner" />,
}));

vi.mock("./NotFound/NotFound", () => ({
  NotFound: () => <div data-testid="not-found-page" />,
}));

vi.mock("./Project/AppPreview", () => ({
  AppPreview: () => <div data-testid="app-preview-page" />,
}));

vi.mock("./Project/UiPage", () => ({
  UIPage: () => <div data-testid="ui-page" />,
}));

vi.mock("./Project/ViewModeTabs", () => ({
  ViewModeTabs: () => <div data-testid="view-mode-tabs" />,
}));

describe("MainContainerCore", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    document.body.innerHTML = "";
  });

  it("renders an explicit project loading state while project config is still loading", async () => {
    await act(async () => {
      root.render(<MainContainerCore doneLoading={false} is404={false} />);
    });

    const loadingState = host.querySelector(
      '[data-testid="project-surface-loading-state"]',
    );
    expect(loadingState).not.toBeNull();
    expect(loadingState?.textContent).toContain("Loading project...");
    expect(loadingState?.textContent).toContain(
      "Waiting for project data to load.",
    );
    expect(
      host.querySelector('[data-testid="legacy-loading-spinner"]'),
    ).toBeNull();
  });

  it("renders the not found state after loading completes with a 404", async () => {
    await act(async () => {
      root.render(<MainContainerCore doneLoading is404 />);
    });

    expect(host.querySelector('[data-testid="not-found-page"]')).not.toBeNull();
  });

  it("renders the project surface after loading completes", async () => {
    await act(async () => {
      root.render(<MainContainerCore doneLoading is404={false} />);
    });

    expect(host.querySelector('[data-testid="overview-pane"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="ui-page"]')).not.toBeNull();
  });
});
