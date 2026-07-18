import type { NavigatorItem } from "@generated/backend";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, test } from "vitest";

import { App, masterInputFocusHints, sidebarWorkspaceBusy } from "./App";
import { compactPaneWidth } from "./app-layout";
import { WorkspaceSidebar } from "./components/workspace-sidebar";
import { useAppearanceStore } from "./stores/appearance-store";
import { useConversationNavigatorStore } from "./stores/conversation-navigator-store";
import { useConversationPaneStore } from "./stores/conversation-pane-store";

beforeEach(() => {
  useAppearanceStore.setState(useAppearanceStore.getInitialState(), true);
  useConversationNavigatorStore.setState(useConversationNavigatorStore.getInitialState(), true);
  useConversationPaneStore.setState(useConversationPaneStore.getInitialState(), true);
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

  test("renders the empty workspace surface inside the preserved shell", () => {
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
    expect(html).toContain('aria-label="Hide project sidebar"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('data-testid="project-sidebar-toggle"');
    expect(html).toContain('data-testid="shell-settings-button"');
    expect(html).toContain('data-testid="workspace-layout-area"');
    expect(html).toContain('data-desktop-platform="darwin"');
    expect(html).toContain('data-testid="workspace-empty-state"');
    expect(html).toContain("Choose a project folder");
    expect(html).toContain('data-testid="choose-project-folder"');
    expect(html).toContain('data-pane-count="0"');
    expect(html).toContain('data-workspace-mode="workspace"');
    expect(html).not.toContain('data-testid="workspace-layout-status"');
    expect(html).not.toContain('data-testid="workspace-benchmark-status"');
    expect(html).not.toContain('data-testid="workspace-performance-stats"');
    expect(html).not.toContain('data-testid="workspace-toolbar"');
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
    expect(html).toContain('aria-label="Hide project sidebar"');
  });

  test("caps project pane widths at compact viewport sizes without growing stored widths", () => {
    expect(compactPaneWidth(360, 560, 128, 0.28)).toBe(156);
    expect(compactPaneWidth(140, 560, 128, 0.28)).toBe(140);
    expect(compactPaneWidth(360, 900, 128, 0.28)).toBe(360);
  });

  test("maps the selected workspace's focused pane and conversation into master hints", () => {
    const focused = {
      focusedConversationId: "conversation_api",
      focusedPaneId: "pane_api",
      paneIdsByConversationId: new Map([["conversation_api", ["pane_api"]]]),
    };

    expect(masterInputFocusHints("workspace_api", focused)).toEqual({
      focusedConversationId: "conversation_api",
      focusedPaneId: "pane_api",
      focusedWorkspaceId: "workspace_api",
    });
    expect(masterInputFocusHints(null, focused)).toEqual({
      focusedConversationId: null,
      focusedPaneId: null,
      focusedWorkspaceId: null,
    });
  });

  test("renders the empty workspace state", () => {
    const html = renderToString(
      <WorkspaceSidebar
        activeWorkspaces={[]}
        busy={false}
        closeWorkspace={async () => {}}
        createConversation={async () => {}}
        openLocalFolder={async () => {}}
        openWorkspacePath={async () => {}}
        openSettingsPane={() => {}}
        presentConversation={async () => {}}
        recentWorkspaces={[]}
        removeRecent={async () => {}}
        selectWorkspace={async () => {}}
        selectedWorkspaceId=""
        workspaceAvailabilities={[]}
      />,
    );

    expect(html).toContain("Conversations");
    expect(hasAriaLabel(html, "Search conversations")).toBe(false);
    expect(hasAriaLabel(html, "New conversation")).toBe(true);
    expect(hasAriaLabel(html, "Open project folder")).toBe(true);
  });

  test("renders active selected and recent workspace state", () => {
    const api = {
      displayName: "api",
      id: "workspace_api",
      lastOpenedAt: "2026-05-29T20:00:00Z",
      rootPath: "/tmp/api",
    };
    const web = {
      displayName: "web",
      id: "workspace_web",
      lastOpenedAt: "2026-05-29T20:05:00Z",
      rootPath: "/tmp/web",
    };
    seedWorkspaceConversationList("workspace_web", [
      conversationListItem("conversation_web", "Build web UI", "workspace_web"),
    ]);
    const html = renderToString(
      <WorkspaceSidebar
        activeWorkspaces={[api, web]}
        busy={false}
        closeWorkspace={async () => {}}
        createConversation={async () => {}}
        openLocalFolder={async () => {}}
        openWorkspacePath={async () => {}}
        openSettingsPane={() => {}}
        presentConversation={async () => {}}
        recentWorkspaces={[web, api]}
        removeRecent={async () => {}}
        selectWorkspace={async () => {}}
        selectedWorkspaceId="workspace_web"
        workspaceAvailabilities={availableWorkspaces([api, web])}
      />,
    );

    expect(html).toContain("web");
    expect(hasAriaLabel(html, "Conversations")).toBe(true);
    expect(hasAriaLabel(html, "New conversation")).toBe(true);
    expect(html).toContain("Build web UI");
  });

  test("renders workspace operation errors in the sidebar", () => {
    const html = renderToString(
      <WorkspaceSidebar
        activeWorkspaces={[]}
        busy={false}
        clearWorkspaceError={() => {}}
        closeWorkspace={async () => {}}
        createConversation={async () => {}}
        openLocalFolder={async () => {}}
        openWorkspacePath={async () => {}}
        openSettingsPane={() => {}}
        presentConversation={async () => {}}
        recentWorkspaces={[]}
        removeRecent={async () => {}}
        selectWorkspace={async () => {}}
        selectedWorkspaceId=""
        workspaceError="workspace path does not exist"
        workspaceAvailabilities={[]}
      />,
    );

    expect(html).toContain('data-testid="workspace-operation-error"');
    expect(html).toContain("workspace path does not exist");
    expect(hasAriaLabel(html, "Dismiss workspace error")).toBe(true);
  });

  test("does not render collapsed workspace conversations while switching workspaces", () => {
    const api = {
      displayName: "api",
      id: "workspace_api",
      lastOpenedAt: "2026-05-29T20:00:00Z",
      rootPath: "/tmp/api",
    };
    const web = {
      displayName: "web",
      id: "workspace_web",
      lastOpenedAt: "2026-05-29T20:05:00Z",
      rootPath: "/tmp/web",
    };
    seedWorkspaceConversationList("workspace_api", [
      conversationListItem("conversation_api", "Old API topic", "workspace_api"),
    ]);
    const html = renderToString(
      <WorkspaceSidebar
        activeWorkspaces={[api, web]}
        busy={false}
        closeWorkspace={async () => {}}
        createConversation={async () => {}}
        openLocalFolder={async () => {}}
        openWorkspacePath={async () => {}}
        openSettingsPane={() => {}}
        presentConversation={async () => {}}
        recentWorkspaces={[]}
        removeRecent={async () => {}}
        selectWorkspace={async () => {}}
        selectedWorkspaceId="workspace_web"
        workspaceAvailabilities={availableWorkspaces([api, web])}
      />,
    );

    expect(html).toContain("web");
    expect(html).not.toContain("Old API topic");
    expect(html).toContain("Loading conversations");
  });

  test("keeps sidebar actions available while selecting a ready workspace", () => {
    expect(sidebarWorkspaceBusy("selecting", "ready")).toBe(false);
    expect(sidebarWorkspaceBusy("opening", "ready")).toBe(true);
    expect(sidebarWorkspaceBusy(null, "loading")).toBe(true);
    expect(sidebarWorkspaceBusy(null, "ready")).toBe(false);
  });

  test("renders failed durable conversation status without requiring an open pane", () => {
    const web = {
      displayName: "web",
      id: "workspace_web",
      lastOpenedAt: "2026-05-29T20:05:00Z",
      rootPath: "/tmp/web",
    };
    seedWorkspaceConversationList(
      "workspace_web",
      [conversationListItem("conversation_web", "Build web UI", "workspace_web")],
      { topicStatus: "failed" },
    );
    const html = renderToString(
      <WorkspaceSidebar
        activeWorkspaces={[web]}
        busy={false}
        closeWorkspace={async () => {}}
        createConversation={async () => {}}
        openLocalFolder={async () => {}}
        openWorkspacePath={async () => {}}
        openSettingsPane={() => {}}
        presentConversation={async () => {}}
        recentWorkspaces={[]}
        removeRecent={async () => {}}
        selectWorkspace={async () => {}}
        selectedWorkspaceId="workspace_web"
        workspaceAvailabilities={availableWorkspaces([web])}
      />,
    );

    expect(hasAriaLabel(html, "Conversation failed")).toBe(true);
    expect(hasAriaLabelContaining(html, "Build web UI, Failed, no open views")).toBe(true);
  });

  test("renders the durable working status in the navigator", () => {
    const web = {
      displayName: "web",
      id: "workspace_web",
      lastOpenedAt: "2026-05-29T20:05:00Z",
      rootPath: "/tmp/web",
    };
    seedWorkspaceConversationList(
      "workspace_web",
      [conversationListItem("conversation_web", "Build web UI", "workspace_web")],
      { topicStatus: "working" },
    );

    const html = renderToString(
      <WorkspaceSidebar
        activeWorkspaces={[web]}
        busy={false}
        closeWorkspace={async () => {}}
        createConversation={async () => {}}
        openLocalFolder={async () => {}}
        openWorkspacePath={async () => {}}
        openSettingsPane={() => {}}
        presentConversation={async () => {}}
        recentWorkspaces={[]}
        removeRecent={async () => {}}
        selectWorkspace={async () => {}}
        selectedWorkspaceId="workspace_web"
        workspaceAvailabilities={availableWorkspaces([web])}
      />,
    );

    expect(hasAriaLabel(html, "Conversation working")).toBe(true);
    expect(html).toContain('data-conversation-palette="sky"');
    expect(html).toContain('class="conversation-navigator-row conversation-presentation-identity');
  });

  test("renders approval waiting as a distinct navigator status", () => {
    const web = {
      displayName: "web",
      id: "workspace_web",
      lastOpenedAt: "2026-05-29T20:05:00Z",
      rootPath: "/tmp/web",
    };
    seedWorkspaceConversationList(
      "workspace_web",
      [conversationListItem("conversation_web", "Build web UI", "workspace_web")],
      { topicStatus: "waiting_for_approval" },
    );

    const html = renderToString(
      <WorkspaceSidebar
        activeWorkspaces={[web]}
        busy={false}
        closeWorkspace={async () => {}}
        createConversation={async () => {}}
        openLocalFolder={async () => {}}
        openWorkspacePath={async () => {}}
        openSettingsPane={() => {}}
        presentConversation={async () => {}}
        recentWorkspaces={[]}
        removeRecent={async () => {}}
        selectWorkspace={async () => {}}
        selectedWorkspaceId="workspace_web"
        workspaceAvailabilities={availableWorkspaces([web])}
      />,
    );

    expect(hasAriaLabel(html, "Conversation waiting for approval")).toBe(true);
  });

  test("bounds large workspace list row rendering", () => {
    const workspaces = Array.from({ length: 3000 }, (_, index) => ({
      displayName: `Workspace ${index}`,
      id: `workspace_${index}`,
      lastOpenedAt: "2026-05-29T20:00:00Z",
      rootPath: `/tmp/workspace-${index}`,
    }));
    seedWorkspaceConversationList("workspace_0", [
      conversationListItem("conversation_workspace_0", "Large workspace topic", "workspace_0"),
    ]);

    const html = renderToString(
      <WorkspaceSidebar
        activeWorkspaces={workspaces}
        busy={false}
        closeWorkspace={async () => {}}
        createConversation={async () => {}}
        openLocalFolder={async () => {}}
        openWorkspacePath={async () => {}}
        openSettingsPane={() => {}}
        presentConversation={async () => {}}
        recentWorkspaces={workspaces}
        removeRecent={async () => {}}
        selectWorkspace={async () => {}}
        selectedWorkspaceId="workspace_0"
        workspaceAvailabilities={availableWorkspaces(workspaces)}
      />,
    );

    expect(rowCount(html, "active-workspace-item")).toBeLessThan(30);
    expect(rowCount(html, "recent-workspace-item")).toBeLessThan(30);
    expect(html).toContain("Large workspace topic");
  });
});

function rowCount(html: string, testId: string) {
  return html.split(`data-testid="${testId}"`).length - 1;
}

function availableWorkspaces(workspaces: readonly { id: string }[]) {
  return workspaces.map((workspace) => ({
    available: true,
    unavailableReason: "",
    workspaceId: workspace.id,
  }));
}
function hasAriaLabel(html: string, label: string) {
  return html.includes(`aria-label="${escapeAttribute(label)}"`);
}

function hasAriaLabelContaining(html: string, text: string) {
  const labels = [...html.matchAll(/aria-label="([^"]*)"/g)].map((match) => match[1] ?? "");
  return labels.some((label) => label.includes(escapeAttribute(text)));
}

function escapeAttribute(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
}

interface TopicListItem {
  createdAt: string;
  id: string;
  title: string;
  updatedAt: string;
  workspaceId: string;
}

function seedWorkspaceConversationList(
  workspaceId: string,
  conversations: TopicListItem[],
  options: {
    error?: string | null;
    loading?: boolean;
    topicStatus?: NavigatorItem["conversation"]["status"];
  } = {},
) {
  const navigatorItems = conversations.map((item) => topicNavigatorItem(item, options.topicStatus));
  useConversationNavigatorStore.setState((current) => ({
    workspaces: {
      ...current.workspaces,
      [workspaceId]: {
        error: options.error ?? null,
        items: navigatorItems,
        loading: options.loading ?? false,
        nextCursor: null,
      },
    },
  }));
}

function topicNavigatorItem(
  item: TopicListItem,
  topicStatus: NavigatorItem["conversation"]["status"] = "idle",
): NavigatorItem {
  return {
    branch: null,
    conversation: {
      archivedAt: null,
      createdAt: item.createdAt,
      id: item.id,
      lastTrajectorySequence: 0,
      status: topicStatus,
      title: item.title,
      topicDescriptor: "",
      updatedAt: item.updatedAt,
      workspaceId: item.workspaceId,
    },
    presentationProfile: {
      conversationId: item.id,
      narratorSpeechEnabled: true,
      narratorVoiceReuse: null,
      narratorVoiceSelection: "auto_distinct",
      paletteReuse: null,
      paletteSelection: "auto_distinct",
      requestedNarratorVoiceId: null,
      requestedPaletteId: null,
      resolvedNarratorVoiceId: "alloy",
      resolvedPaletteId: "sky",
      updatedAt: item.updatedAt,
    },
  };
}

function conversationListItem(
  id: string,
  title: string,
  workspaceId = "workspace_web",
): TopicListItem {
  return {
    createdAt: "2026-05-29T20:00:00Z",
    id,
    title,
    updatedAt: "2026-05-29T20:00:00Z",
    workspaceId,
  };
}
