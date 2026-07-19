import { renderToString } from "react-dom/server";
import type { ConversationPaneResourceBinding, WorkspaceSession } from "@generated/backend";
import { beforeEach, describe, expect, test } from "vitest";

import { App, masterInputFocusHints } from "./App";
import { compactPaneWidth } from "./app-layout";
import { useAppearanceStore } from "./stores/appearance-store";
import { useConversationNavigatorStore } from "./stores/conversation-navigator-store";
import { useConversationPaneStore } from "./stores/conversation-pane-store";
import { useSettingsNavigationStore } from "./stores/settings-navigation-store";

beforeEach(() => {
  useAppearanceStore.setState(useAppearanceStore.getInitialState(), true);
  useConversationNavigatorStore.setState(useConversationNavigatorStore.getInitialState(), true);
  useConversationPaneStore.setState(useConversationPaneStore.getInitialState(), true);
  useSettingsNavigationStore.setState(useSettingsNavigationStore.getInitialState(), true);
});

describe("workspace renderer states", () => {
  test("renders a preload contract error when the Electron API is missing", () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {},
    });

    const html = renderToString(<App />);

    expect(html).toContain('data-testid="app-runtime-contract-error"');
    expect(html).toContain("Setta preload API is unavailable.");
    expect(html).toContain("window.setta");
  });

  test("renders the pane shell without the project sidebar or folder picker", () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        setta: {
          app: { platform: "darwin" },
        },
      },
    });

    const html = renderToString(<App />);

    expect(html).toContain('data-testid="shell-top-bar"');
    expect(html).toContain('data-setta-shell-title-bar="true"');
    expect(html).toContain("setta-shell-top-bar-logo");
    expect(html).not.toContain('data-testid="shell-icon-rail"');
    expect(html).not.toContain('data-testid="shell-chrome-plate"');
    expect(html).not.toContain('aria-label="Hide project sidebar"');
    expect(html).not.toContain('data-testid="project-sidebar-toggle"');
    expect(html).toContain('data-testid="shell-settings-button"');
    expect(html).toContain('data-testid="workspace-layout-area"');
    expect(html).toContain('data-desktop-platform="darwin"');
    expect(html).not.toContain('data-testid="workspace-empty-state"');
    expect(html).not.toContain("Choose a project folder");
    expect(html).not.toContain('data-testid="choose-project-folder"');
    expect(html).toContain('data-pane-count="1"');
    expect(html).toContain('data-workspace-mode="workspace"');
    expect(html).not.toContain('data-testid="workspace-layout-status"');
    expect(html).not.toContain('data-testid="workspace-benchmark-status"');
    expect(html).not.toContain('data-testid="workspace-performance-stats"');
    expect(html).not.toContain('data-testid="sidebar-logo-shell"');
    expect(html).not.toContain('data-testid="sidebar-memory-footer"');
    expect(html).not.toContain('data-testid="workspace-pane-grid-shell"');
    expect(html).not.toContain('data-testid="bottom-workspace-pane"');
    expect(html).not.toContain('data-testid="right-workspace-pane"');
  });

  test("renders the desktop top bar on non-mac platforms", () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        setta: {
          app: { platform: "win32" },
        },
      },
    });

    const html = renderToString(<App />);

    expect(html).toContain('data-testid="shell-top-bar"');
    expect(html).not.toContain('data-testid="shell-icon-rail"');
    expect(html).not.toContain('data-testid="shell-chrome-plate"');
    expect(html).toContain('data-desktop-platform="win32"');
    expect(html).not.toContain('aria-label="Hide project sidebar"');
  });

  test("caps project pane widths at compact viewport sizes without growing stored widths", () => {
    expect(compactPaneWidth(360, 560, 128, 0.28)).toBe(156);
    expect(compactPaneWidth(140, 560, 128, 0.28)).toBe(140);
    expect(compactPaneWidth(360, 900, 128, 0.28)).toBe(360);
  });

  test("maps the focused app pane resource binding into master hints", () => {
    const resourceBindings: ConversationPaneResourceBinding[] = [
      { folder: { rootPath: "/tmp/api" }, kind: "folder" },
    ];
    const focused = {
      focusedConversationId: "conversation_api",
      focusedConversationResourceBindings: resourceBindings,
      focusedPaneId: "pane_api",
      paneIdByConversationId: new Map([["conversation_api", "pane_api"]]),
      resourceBindingsByConversationId: new Map([["conversation_api", resourceBindings]]),
    };

    expect(masterInputFocusHints(workspaceSession(), focused)).toEqual({
      focusedConversationId: "conversation_api",
      focusedPaneId: "pane_api",
      focusedWorkspaceId: "workspace_api",
    });
    expect(
      masterInputFocusHints(workspaceSession(), {
        ...focused,
        focusedConversationResourceBindings: [],
      }),
    ).toEqual({
      focusedConversationId: "conversation_api",
      focusedPaneId: "pane_api",
      focusedWorkspaceId: null,
    });
    expect(masterInputFocusHints(workspaceSession(), undefined)).toEqual({
      focusedConversationId: null,
      focusedPaneId: null,
      focusedWorkspaceId: null,
    });
  });
});

function workspaceSession(): WorkspaceSession {
  return {
    activeWorkspaces: [
      {
        displayName: "api",
        id: "workspace_api",
        lastOpenedAt: "2026-07-22T20:00:00Z",
        rootPath: "/tmp/api",
      },
    ],
    recentWorkspaces: [],
    selectedWorkspaceId: "workspace_other",
    workspaceAvailabilities: [
      { available: true, unavailableReason: "", workspaceId: "workspace_api" },
    ],
  };
}
