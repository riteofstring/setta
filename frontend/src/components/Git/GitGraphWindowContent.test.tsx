import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useMisc } from "state/definitions";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GitGraphWindowContent } from "./GitGraphWindowContent";

vi.mock("state/actions/git", () => ({
  ensureGitGraphStateLoaded: vi.fn(),
}));

vi.mock("./GitGraphOverlay", () => ({
  GitGraphOverlay: ({
    extraHeaderActions,
    leftSidebar,
  }: {
    extraHeaderActions?: ReactNode;
    leftSidebar?: ReactNode;
  }) => (
    <div data-testid="mock-git-graph-overlay">
      {extraHeaderActions ? (
        <div data-testid="mock-git-graph-overlay-extra-actions">
          {extraHeaderActions}
        </div>
      ) : null}
      {leftSidebar ? (
        <div data-testid="mock-git-graph-overlay-left-sidebar">
          {leftSidebar}
        </div>
      ) : null}
    </div>
  ),
}));

vi.mock("components/Panes/Overview/Git/GitPane", () => ({
  GitPane: ({ showGraphButton = true }: { showGraphButton?: boolean }) => (
    <div
      data-testid="mock-git-pane"
      data-show-graph-button={showGraphButton ? "true" : "false"}
    >
      git pane
    </div>
  ),
}));

function syncStoreInitialState(store: {
  getState: () => Record<string, unknown>;
  getInitialState?: () => Record<string, unknown>;
}): void {
  if (!store.getInitialState) {
    return;
  }
  Object.assign(store.getInitialState(), store.getState());
}

function renderGraphWindowContent(
  props: Partial<Parameters<typeof GitGraphWindowContent>[0]> = {},
): string {
  syncStoreInitialState(useMisc);
  return renderToStaticMarkup(<GitGraphWindowContent {...props} />);
}

describe("GitGraphWindowContent", () => {
  beforeEach(() => {
    useMisc.getState().reset();
  });

  afterEach(() => {
    useMisc.getState().reset();
  });

  it("shows the embedded git-pane toggle for untracked graph windows", () => {
    const markup = renderGraphWindowContent({
      instanceId: "graph-window-1",
      showEmbeddedGitPaneToggle: true,
    });

    expect(markup).toContain(
      'data-testid="git-graph-toggle-embedded-git-pane"',
    );
    expect(markup).toContain('aria-pressed="false"');
    expect(markup).not.toContain(
      'data-testid="mock-git-graph-overlay-left-sidebar"',
    );
  });

  it("renders the embedded git pane when that window instance enables it", () => {
    useMisc.setState({
      projectChatGitGraphEmbeddedPaneVisibleByInstanceId: {
        "graph-window-1": true,
      },
    });

    const markup = renderGraphWindowContent({
      instanceId: "graph-window-1",
      showEmbeddedGitPaneToggle: true,
    });

    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain(
      'data-testid="mock-git-graph-overlay-left-sidebar"',
    );
    expect(markup).toContain('data-testid="mock-git-pane"');
    expect(markup).toContain('data-show-graph-button="false"');
  });

  it("keeps the toggle hidden for tracked/default graph windows", () => {
    const markup = renderGraphWindowContent({
      instanceId: "graph-window-1",
      showEmbeddedGitPaneToggle: false,
    });

    expect(markup).not.toContain(
      'data-testid="git-graph-toggle-embedded-git-pane"',
    );
  });

  it("uses controlled embedded git-pane visibility instead of workspace misc state", () => {
    useMisc.setState({
      projectChatGitGraphEmbeddedPaneVisibleByInstanceId: {
        "graph-window-1": true,
      },
    });

    const markup = renderGraphWindowContent({
      instanceId: "graph-window-1",
      showEmbeddedGitPaneToggle: true,
      embeddedGitPaneVisible: false,
      onEmbeddedGitPaneVisibleChange: () => {},
    });

    expect(markup).toContain('aria-pressed="false"');
    expect(markup).not.toContain(
      'data-testid="mock-git-graph-overlay-left-sidebar"',
    );
  });
});
