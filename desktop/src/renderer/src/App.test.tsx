import type {
  ChatMessage,
  ConversationListItem,
  CorruptionSummary,
  Diagnostic,
  Run,
  RunItem,
  RunItemOutput,
  TranscriptTurn,
} from "@generated/backend";
import { renderToString } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { App } from "./App";
import { compactBottomPaneHeight, compactPaneWidth, paneVisibility } from "./app-layout";
import { ChatTranscript, type ChatTranscriptProps } from "./components/chat-transcript";
import { SettingsPanel } from "./components/settings-panel";
import { WorkspacePanel } from "./components/workspace-panel";
import { WorkspaceSidebar } from "./components/workspace-sidebar";
import {
  canSplitWorkspacePaneTab,
  canCreateWorkspacePane,
  maxWorkspacePaneCount,
  WorkspacePanePanel,
  type WorkspacePaneState,
} from "./components/workspace-pane";

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

  test("renders the real niri workspace inside the preserved shell", () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        setta: {
          app: { platform: "darwin" },
          backend: { onEventStreamStatus: () => () => {} },
          chat: { onEvent: () => () => {} },
        },
      },
    });

    const html = renderToString(<App />);

    expect(html).toContain('data-testid="shell-top-bar"');
    expect(html).toContain('aria-label="Hide project sidebar"');
    expect(html).toContain('data-testid="niri-workspace-area"');
    expect(html).toContain('data-testid="niri-presentation-engine"');
    expect(rowCount(html, "niri-fake-pane-host")).toBe(12);
    expect(html).toContain('data-pane-count="6"');
    expect(html).toContain('data-workspace-mode="workspace"');
    expect(html).toContain('data-testid="niri-workspace-status"');
    expect(html).toContain('data-testid="niri-workspace-toolbar"');
    expect(html).not.toContain('data-testid="workspace-pane-grid-shell"');
    expect(html).not.toContain('data-testid="chat-pane-surface"');
    expect(html).not.toContain('data-testid="settings-pane-surface"');
    expect(html).toContain("bg-background");
  });

  test("caps pane widths at compact viewport sizes without growing stored widths", () => {
    expect(compactPaneWidth(360, 560, 160, 0.34)).toBe(190);
    expect(compactPaneWidth(360, 320, 160, 0.34)).toBe(160);
    expect(compactPaneWidth(140, 560, 128, 0.28)).toBe(140);
    expect(compactPaneWidth(360, 900, 160, 0.34)).toBe(360);
  });

  test("caps bottom pane height at compact viewport sizes", () => {
    expect(compactBottomPaneHeight(288, 320)).toBe(108);
    expect(compactBottomPaneHeight(72, 320)).toBe(72);
    expect(compactBottomPaneHeight(288, 900)).toBe(288);
  });

  test("uses a single horizontal content pane at narrow viewport sizes", () => {
    expect(
      paneVisibility({
        bottomPaneOpen: true,
        chatPaneOpen: true,
        maximizedPane: null,
        projectPaneOpen: true,
        rightPaneOpen: true,
        viewportWidth: 320,
      }),
    ).toEqual({
      bottom: true,
      chat: false,
      content: true,
      project: false,
      right: true,
    });
    expect(
      paneVisibility({
        bottomPaneOpen: false,
        chatPaneOpen: true,
        maximizedPane: null,
        projectPaneOpen: true,
        rightPaneOpen: false,
        viewportWidth: 320,
      }),
    ).toEqual({
      bottom: false,
      chat: true,
      content: true,
      project: false,
      right: false,
    });
    expect(
      paneVisibility({
        bottomPaneOpen: false,
        chatPaneOpen: false,
        maximizedPane: null,
        projectPaneOpen: true,
        rightPaneOpen: false,
        viewportWidth: 320,
      }),
    ).toEqual({
      bottom: false,
      chat: false,
      content: false,
      project: true,
      right: false,
    });
  });

  test("renders the empty workspace state", () => {
    const html = renderToString(
      <>
        <WorkspaceSidebar
          activeRun={null}
          activeWorkspaces={[]}
          busy={false}
          chatBusy={false}
          closeWorkspace={async () => {}}
          conversations={[]}
          corruption={emptyCorruption()}
          createConversation={async () => {}}
          createWorkspaceConversation={async () => {}}
          deleteConversation={async () => {}}
          diagnostics={[]}
          openLocalFolder={async () => {}}
          openSettingsPane={() => {}}
          recentWorkspaces={[]}
          removeRecent={async () => {}}
          selectConversation={async () => {}}
          selectWorkspace={async () => {}}
          selectedConversationId=""
          selectedWorkspaceId=""
          unreadConversationIds={{}}
        />
        <WorkspacePanel
          error={null}
          openLocalFolder={async () => {}}
          operation={null}
          selectedWorkspace={null}
          status="idle"
        />
      </>,
    );

    expect(html).toContain("No workspace open");
    expect(html).toContain('data-testid="projects-section"');
    expect(html).toContain('data-testid="sidebar-empty-space"');
    expect(html).not.toContain("New setta gen");
    expect(html).not.toContain("Plugins");
    expect(html).not.toContain("Automations");
    expect(html).not.toContain("Notifications / Logs");
    expect(html).not.toContain("DB / Memories");
    expect(html).not.toContain("New note");
    expect(html).not.toContain("New rule");
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
    const html = renderToString(
      <>
        <WorkspaceSidebar
          activeRun={null}
          activeWorkspaces={[api, web]}
          busy={false}
          chatBusy={false}
          closeWorkspace={async () => {}}
          conversations={[conversationListItem("conversation_web", "Build web UI")]}
          corruption={emptyCorruption()}
          createConversation={async () => {}}
          createWorkspaceConversation={async () => {}}
          deleteConversation={async () => {}}
          diagnostics={[]}
          openLocalFolder={async () => {}}
          openSettingsPane={() => {}}
          recentWorkspaces={[web, api]}
          removeRecent={async () => {}}
          selectConversation={async () => {}}
          selectWorkspace={async () => {}}
          selectedConversationId=""
          selectedWorkspaceId="workspace_web"
          unreadConversationIds={{}}
        />
        <WorkspacePanel
          error={null}
          openLocalFolder={async () => {}}
          operation={null}
          selectedWorkspace={web}
          status="ready"
        />
      </>,
    );

    expect(html).toContain("web");
    expect(html).toContain("/tmp/web");
    expect(html).toContain("Active");
    expect(html).toContain('data-testid="active-workspace-list"');
    expect(html).toContain('aria-label="New chat in web"');
    expect(html.indexOf('aria-label="More options for web"')).toBeLessThan(
      html.indexOf('aria-label="New chat in web"'),
    );
    expect(html).toContain("Build web UI");
    expect(html).not.toContain('data-testid="conversation-hover-card"');
    expect(html).toContain("Pin Build web UI");
    expect(html).toContain("Delete Build web UI");
    expect(html).not.toContain("New terminal in web");
    expect(html).not.toContain("New setta canvas in web");
  });

  test("renders chat corruption status in the project and conversation list", () => {
    const web = {
      displayName: "web",
      id: "workspace_web",
      lastOpenedAt: "2026-05-29T20:05:00Z",
      rootPath: "/tmp/web",
    };
    const html = renderToString(
      <WorkspaceSidebar
        activeRun={null}
        activeWorkspaces={[web]}
        busy={false}
        chatBusy={false}
        closeWorkspace={async () => {}}
        conversations={[conversationListItem("conversation_web", "Build web UI")]}
        corruption={{
          byKind: [{ count: 2, key: "run" }],
          bySeverity: [{ count: 2, key: "critical" }],
          hasCorruption: true,
          total: 2,
        }}
        createConversation={async () => {}}
        createWorkspaceConversation={async () => {}}
        deleteConversation={async () => {}}
        diagnostics={[criticalDiagnostic("conversation_web")]}
        openLocalFolder={async () => {}}
        openSettingsPane={() => {}}
        recentWorkspaces={[]}
        removeRecent={async () => {}}
        selectConversation={async () => {}}
        selectWorkspace={async () => {}}
        selectedConversationId="conversation_web"
        selectedWorkspaceId="workspace_web"
        unreadConversationIds={{}}
      />,
    );

    expect(html).toContain('data-testid="workspace-corruption-status"');
    expect(html).toContain('data-testid="workspace-corruption-tooltip"');
    expect(html).toContain('data-testid="conversation-corruption-status"');
    expect(html).toContain("Malformed chat data");
    expect(html).toContain("2 corrupt chat records detected");
    expect(html).toContain("1 corrupt chat record detected");
    expect(html).toContain("assistant message message_missing was not found");
    expect(html).toContain("Path: /tmp/run.json");
  });

  test("renders loading and error states", () => {
    const html = renderToString(
      <WorkspacePanel
        error="workspace path does not exist"
        openLocalFolder={async () => {}}
        operation="opening"
        selectedWorkspace={null}
        status="error"
      />,
    );

    expect(html).toContain("Opening");
    expect(html).toContain("workspace path does not exist");
    expect(html).toContain('data-testid="workspace-error"');
  });

  test("bounds large workspace list row rendering", () => {
    const workspaces = Array.from({ length: 3000 }, (_, index) => ({
      displayName: `Workspace ${index}`,
      id: `workspace_${index}`,
      lastOpenedAt: "2026-05-29T20:00:00Z",
      rootPath: `/tmp/workspace-${index}`,
    }));

    const html = renderToString(
      <WorkspaceSidebar
        activeRun={null}
        activeWorkspaces={workspaces}
        busy={false}
        chatBusy={false}
        closeWorkspace={async () => {}}
        conversations={[]}
        corruption={emptyCorruption()}
        createConversation={async () => {}}
        createWorkspaceConversation={async () => {}}
        deleteConversation={async () => {}}
        diagnostics={[]}
        openLocalFolder={async () => {}}
        openSettingsPane={() => {}}
        recentWorkspaces={workspaces}
        removeRecent={async () => {}}
        selectConversation={async () => {}}
        selectWorkspace={async () => {}}
        selectedConversationId=""
        selectedWorkspaceId="workspace_0"
        unreadConversationIds={{}}
      />,
    );

    expect(rowCount(html, "active-workspace-item")).toBeLessThan(30);
    expect(rowCount(html, "recent-workspace-item")).toBeLessThan(30);
  });

  test("renders only production-backed workspace pane and settings surfaces", () => {
    const emptyPane = renderToString(
      <WorkspacePanePanel
        activeTabId=""
        avoidShellLeftControls={false}
        avoidShellRightControls={false}
        canClosePane={false}
        inShellTopBar={false}
        initialNewTabMenuOpen
        maximized={false}
        onCloseTab={() => {}}
        onCreateTab={() => {}}
        onSelectTab={() => {}}
        paneId="test_right_pane"
        shellLeftInsetClass=""
        shellRightInsetClass=""
        showNewTabButton
        slot="right"
        tabs={[]}
      />,
    );
    const settings = renderToString(<SettingsPanel />);

    expect(emptyPane).toContain("New pane tab");
    expect(emptyPane).toContain("Chat");
    expect(emptyPane).toContain("Settings");
    expect(emptyPane).not.toContain("Browser");
    expect(emptyPane).not.toContain("Canvas");
    expect(emptyPane).not.toContain("Terminal");
    expect(settings).toContain("Codex Account");
    expect(settings).not.toContain("Reset");
    expect(settings).not.toContain("Shortcuts");
    expect(settings).not.toContain("Storage");
    expect(settings).not.toContain("Voice input");
  });

  test("renders pane tabs in the shell top bar with a pointer drag handle", () => {
    const html = renderToString(
      <WorkspacePanePanel
        activeTabId="tab_chat"
        avoidShellLeftControls={false}
        avoidShellRightControls={false}
        canClosePane={false}
        inShellTopBar
        initialNewTabMenuOpen={false}
        maximized={false}
        onCloseTab={() => {}}
        onCreateTab={() => {}}
        onSelectTab={() => {}}
        paneId="test_chat_pane"
        renderTabContent={() => <div>Chat surface</div>}
        shellLeftInsetClass=""
        shellRightInsetClass=""
        showNewTabButton
        slot="grid"
        tabs={[{ id: "tab_chat", kind: "chat", title: "Chat" }]}
      />,
    );

    expect(html).toContain('data-in-shell-top-bar="true"');
    expect(html).toContain("app-drag flex min-w-0 flex-1 flex-nowrap");
    expect(html).toContain("app-no-drag group relative flex h-7");
    expect(html).not.toContain('draggable="true"');
    expect(html).toContain('draggable="false"');
    expect(html).toContain('data-testid="workspace-pane-tab-tab_chat"');
    expect(html).toContain('title="Drag Chat to split pane"');
    expect(html).toContain("lucide-grip-vertical");
  });

  test("caps workspace panes at four", () => {
    expect(canCreateWorkspacePane(workspacePaneStates(maxWorkspacePaneCount - 1))).toBe(true);
    expect(canCreateWorkspacePane(workspacePaneStates(maxWorkspacePaneCount))).toBe(false);
  });

  test("allows tab splitting when a move keeps the pane count within four", () => {
    expect(canSplitWorkspacePaneTab(workspacePaneStates(maxWorkspacePaneCount), "pane_0")).toBe(
      true,
    );
    expect(
      canSplitWorkspacePaneTab(
        [
          {
            activeTabId: "tab_0",
            id: "pane_0",
            tabs: [{ id: "tab_0", kind: "chat", title: "Chat" }],
          },
          {
            activeTabId: "tab_1",
            id: "pane_1",
            tabs: [
              { id: "tab_1", kind: "chat", title: "Chat" },
              { id: "tab_2", kind: "settings", title: "Settings" },
            ],
          },
          {
            activeTabId: "tab_3",
            id: "pane_2",
            tabs: [{ id: "tab_3", kind: "chat", title: "Chat" }],
          },
          {
            activeTabId: "tab_4",
            id: "pane_3",
            tabs: [{ id: "tab_4", kind: "settings", title: "Settings" }],
          },
        ],
        "pane_1",
      ),
    ).toBe(false);
  });
});

describe("chat renderer states", () => {
  test("renders markdown messages without trusting raw html", () => {
    const html = renderToString(
      <TestChatTranscript
        activeRun={null}
        hasMoreOlder={false}
        loadOlder={async () => {}}
        loadRunItemOutput={async () => {}}
        messages={[
          {
            conversationId: "conversation_api",
            createdAt: "2026-05-29T20:00:00Z",
            delivery: "normal",
            id: "message_assistant",
            ordinal: 1,
            parts: [
              {
                format: "markdown",
                id: "part_assistant",
                text: "**Done** `<script>`",
                type: "text",
              },
            ],
            role: "assistant",
            runId: "run_api",
            schemaVersion: 1,
            status: "complete",
            updatedAt: "2026-05-29T20:00:00Z",
          },
        ]}
        runItemOutputs={[]}
        runItems={[]}
        submitApproval={async () => {}}
      />,
    );

    expect(html).toContain("<strong");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });

  test("bounds large transcript row rendering", () => {
    const messages = Array.from({ length: 5000 }, (_, index) =>
      chatMessage(`message_${index}`, index + 1),
    );

    const html = renderToString(
      <TestChatTranscript
        activeRun={null}
        hasMoreOlder={false}
        loadOlder={async () => {}}
        loadRunItemOutput={async () => {}}
        messages={messages}
        runItemOutputs={[]}
        runItems={[]}
        submitApproval={async () => {}}
      />,
    );

    expect(rowCount(html, "chat-assistant-turn-row")).toBeLessThanOrEqual(30);
  });

  test("renders queued steering and activity rows", () => {
    const html = renderToString(
      <TestChatTranscript
        activeRun={null}
        hasMoreOlder={false}
        loadOlder={async () => {}}
        loadRunItemOutput={async () => {}}
        messages={[
          {
            conversationId: "conversation_api",
            createdAt: "2026-05-29T20:00:00Z",
            delivery: "queued",
            id: "message_queued",
            ordinal: 1,
            parts: [{ format: "plain", id: "part_queued", text: "queued", type: "text" }],
            role: "user",
            runId: "run_queue",
            schemaVersion: 1,
            status: "pending",
            updatedAt: "2026-05-29T20:00:00Z",
          },
          {
            conversationId: "conversation_api",
            createdAt: "2026-05-29T20:00:00Z",
            delivery: "steering",
            id: "message_steering",
            ordinal: 2,
            parts: [{ format: "plain", id: "part_steering", text: "steer", type: "text" }],
            role: "user",
            runId: "run_api",
            schemaVersion: 1,
            status: "complete",
            updatedAt: "2026-05-29T20:00:00Z",
          },
          {
            conversationId: "conversation_api",
            createdAt: "2026-05-29T20:00:00Z",
            delivery: "normal",
            id: "message_assistant",
            ordinal: 3,
            parts: [{ format: "markdown", id: "part_assistant", text: "done", type: "text" }],
            role: "assistant",
            runId: "run_api",
            schemaVersion: 1,
            status: "complete",
            updatedAt: "2026-05-29T20:00:00Z",
          },
        ]}
        runItemOutputs={[
          {
            createdAt: "2026-05-29T20:00:00Z",
            id: "output_1",
            ordinal: 1,
            runItemId: "item_command",
            schemaVersion: 1,
            stream: "stdout",
            text: "ok\n",
          },
        ]}
        runItems={[
          {
            command: "go test ./...",
            completedAt: "",
            conversationId: "conversation_api",
            createdAt: "2026-05-29T20:00:00Z",
            cwd: "/tmp/workspace",
            details: null,
            diffSummary: "",
            durationMs: 10,
            error: "",
            exitCode: 0,
            filePaths: [],
            hiddenText: "",
            id: "item_command",
            noticeKind: "",
            namespace: "",
            noticeMessage: "",
            patchStatus: "",
            processId: "",
            progress: "",
            providerItemId: "command_provider",
            requestId: "",
            result: "",
            reviewId: "",
            runId: "run_api",
            schemaVersion: 1,
            serverName: "",
            startedAt: "2026-05-29T20:00:00Z",
            status: "completed",
            summary: "",
            title: "",
            toolName: "",
            type: "command_execution",
            workspaceId: "workspace_api",
          },
          {
            command: "",
            completedAt: "",
            conversationId: "conversation_api",
            createdAt: "2026-05-29T20:00:00Z",
            cwd: "",
            details: null,
            diffSummary: "",
            durationMs: 0,
            error: "",
            exitCode: 0,
            filePaths: ["/tmp/workspace/main.go"],
            hiddenText: "",
            id: "item_file",
            noticeKind: "",
            namespace: "",
            noticeMessage: "",
            patchStatus: "updated",
            processId: "",
            progress: "",
            providerItemId: "file_provider",
            requestId: "",
            result: "",
            reviewId: "",
            runId: "run_api",
            schemaVersion: 1,
            serverName: "",
            startedAt: "2026-05-29T20:00:00Z",
            status: "running",
            summary: "",
            title: "",
            toolName: "",
            type: "file_change",
            workspaceId: "workspace_api",
          },
          {
            command: "",
            completedAt: "",
            conversationId: "conversation_api",
            createdAt: "2026-05-29T20:00:00Z",
            cwd: "",
            details: null,
            diffSummary: "",
            durationMs: 0,
            error: "",
            exitCode: 0,
            filePaths: [],
            hiddenText: "",
            id: "item_mcp",
            noticeKind: "",
            namespace: "",
            noticeMessage: "",
            patchStatus: "",
            processId: "",
            progress: "halfway",
            providerItemId: "mcp_provider",
            requestId: "",
            result: "",
            reviewId: "",
            runId: "run_api",
            schemaVersion: 1,
            serverName: "server",
            startedAt: "2026-05-29T20:00:00Z",
            status: "running",
            summary: "",
            title: "",
            toolName: "tool",
            type: "mcp_tool_call",
            workspaceId: "workspace_api",
          },
          {
            command: "",
            completedAt: "",
            conversationId: "conversation_api",
            createdAt: "2026-05-29T20:00:00Z",
            cwd: "",
            details: null,
            diffSummary: "",
            durationMs: 0,
            error: "",
            exitCode: 0,
            filePaths: [],
            hiddenText: "",
            id: "item_notice",
            noticeKind: "warning",
            namespace: "",
            noticeMessage: "warning text",
            patchStatus: "",
            processId: "",
            progress: "",
            providerItemId: "notice_provider",
            requestId: "",
            result: "",
            reviewId: "",
            runId: "run_api",
            schemaVersion: 1,
            serverName: "",
            startedAt: "2026-05-29T20:00:00Z",
            status: "completed",
            summary: "",
            title: "",
            toolName: "",
            type: "notice",
            workspaceId: "workspace_api",
          },
          {
            command: "",
            completedAt: "",
            conversationId: "conversation_api",
            createdAt: "2026-05-29T20:00:00Z",
            cwd: "",
            details: null,
            diffSummary: "",
            durationMs: 0,
            error: "",
            exitCode: 0,
            filePaths: [],
            hiddenText: "",
            id: "item_agent_message",
            noticeKind: "",
            namespace: "",
            noticeMessage: "",
            patchStatus: "",
            processId: "",
            progress: "",
            providerItemId: "agent_provider",
            requestId: "",
            result: "",
            reviewId: "",
            runId: "run_api",
            schemaVersion: 1,
            serverName: "",
            startedAt: "2026-05-29T20:00:00Z",
            status: "completed",
            summary: "",
            title: "",
            toolName: "",
            type: "agent_message",
            workspaceId: "workspace_api",
          },
        ]}
        submitApproval={async () => {}}
      />,
    );

    expect(html).toContain("Queued");
    expect(html).toContain("Steering");
    expect(html).toContain("go test ./...");
    expect(html).toContain("main.go");
    expect(html).toContain("halfway");
    expect(html).toContain("warning text");
    expect(html).toContain('dateTime="2026-05-29T20:00:00Z"');
    expect(rowCount(html, "run-activity-group")).toBe(1);
    expect(rowCount(html, "run-activity-row")).toBe(4);
    expect(html).not.toContain("assistant message");
  });

  test("renders load more for paged run output", () => {
    const html = renderToString(
      <TestChatTranscript
        activeRun={null}
        hasMoreOlder={false}
        loadOlder={async () => {}}
        loadRunItemOutput={async () => {}}
        messages={[
          {
            conversationId: "conversation_api",
            createdAt: "2026-05-29T20:00:00Z",
            delivery: "normal",
            id: "message_assistant",
            ordinal: 1,
            parts: [{ format: "markdown", id: "part_assistant", text: "done", type: "text" }],
            role: "assistant",
            runId: "run_api",
            schemaVersion: 1,
            status: "complete",
            updatedAt: "2026-05-29T20:00:00Z",
          },
        ]}
        runItemOutputPagesByRunItemId={{
          item_command: {
            error: null,
            hasMore: true,
            loadedThroughOrdinal: 1,
            loading: false,
            nextOrdinal: 1,
          },
        }}
        runItemOutputs={[
          {
            createdAt: "2026-05-29T20:00:00Z",
            id: "output_1",
            ordinal: 1,
            runItemId: "item_command",
            schemaVersion: 1,
            stream: "stdout",
            text: "partial\n",
          },
        ]}
        runItems={[
          {
            command: "go test ./...",
            completedAt: "",
            conversationId: "conversation_api",
            createdAt: "2026-05-29T20:00:00Z",
            cwd: "/tmp/workspace",
            details: null,
            diffSummary: "",
            durationMs: 0,
            error: "",
            exitCode: 0,
            filePaths: [],
            hiddenText: "",
            id: "item_command",
            noticeKind: "",
            namespace: "",
            noticeMessage: "",
            patchStatus: "",
            processId: "",
            progress: "",
            providerItemId: "command_provider",
            requestId: "",
            result: "",
            reviewId: "",
            runId: "run_api",
            schemaVersion: 1,
            serverName: "",
            startedAt: "2026-05-29T20:00:00Z",
            status: "completed",
            summary: "",
            title: "",
            toolName: "",
            type: "command_execution",
            workspaceId: "workspace_api",
          },
        ]}
        submitApproval={async () => {}}
      />,
    );

    expect(html).toContain("Load more");
  });

  test("renders pending approval controls", () => {
    const html = renderToString(
      <TestChatTranscript
        activeRun={{
          assistantMessageId: "message_assistant",
          completedAt: "",
          conversationId: "conversation_api",
          error: "",
          harness: "codex",
          id: "run_api",
          pendingApproval: {
            approved: false,
            body: "Codex wants permission",
            command: "go test ./...",
            createdAt: "2026-05-29T20:00:00Z",
            filePath: "",
            id: "approval_api",
            kind: "command",
            options: [],
            providerItemId: "",
            questions: [],
            permission: "",
            question: "",
            resolvedAt: "",
            response: "",
            runId: "run_api",
            runItemId: "",
            status: "pending",
            structuredInput: null,
            title: "Run command",
          },
          promptSummary: "test",
          schemaVersion: 1,
          startedAt: "2026-05-29T20:00:00Z",
          status: "running",
          triggerMessageId: "message_user",
          workspaceId: "workspace_api",
        }}
        hasMoreOlder={false}
        loadOlder={async () => {}}
        loadRunItemOutput={async () => {}}
        messages={[]}
        runItemOutputs={[]}
        runItems={[]}
        submitApproval={async () => {}}
      />,
    );

    expect(html).toContain("Run command");
    expect(html).toContain("go test ./...");
    expect(html).toContain("Approve");
    expect(html).toContain("Deny");
  });

  test("renders user input approval answer controls", () => {
    const html = renderToString(
      <TestChatTranscript
        activeRun={{
          assistantMessageId: "message_assistant",
          completedAt: "",
          conversationId: "conversation_api",
          error: "",
          harness: "codex",
          id: "run_api",
          pendingApproval: {
            approved: false,
            body: "Choose a branch",
            command: "",
            createdAt: "2026-05-29T20:00:00Z",
            filePath: "",
            id: "approval_api",
            kind: "user_input",
            options: ["main", "release"],
            permission: "",
            providerItemId: "",
            question: "Which branch should Codex use?",
            questions: [
              {
                header: "Branch",
                id: "branch",
                isOther: false,
                isSecret: false,
                options: ["main", "release"],
                question: "Which branch should Codex use?",
              },
              {
                header: "Mode",
                id: "mode",
                isOther: false,
                isSecret: false,
                options: ["fast", "careful"],
                question: "Which mode?",
              },
            ],
            resolvedAt: "",
            response: "",
            runId: "run_api",
            runItemId: "",
            status: "pending",
            structuredInput: null,
            title: "Branch",
          },
          promptSummary: "test",
          schemaVersion: 1,
          startedAt: "2026-05-29T20:00:00Z",
          status: "running",
          triggerMessageId: "message_user",
          workspaceId: "workspace_api",
        }}
        hasMoreOlder={false}
        loadOlder={async () => {}}
        loadRunItemOutput={async () => {}}
        messages={[]}
        runItemOutputs={[]}
        runItems={[]}
        submitApproval={async () => {}}
      />,
    );

    expect(html).toContain("Which branch should Codex use?");
    expect(html).toContain("main");
    expect(html).toContain("release");
    expect(html).toContain("Answer");
    expect(html).toContain("Cancel");
  });
});

function TestChatTranscript({
  messages = [],
  runItemOutputPagesByRunItemId = {},
  runItemOutputs = [],
  runItems = [],
  transcript,
  updateUserMessage = async () => {},
  ...props
}: Omit<
  ChatTranscriptProps,
  | "messageIds"
  | "messagesById"
  | "runItemIdsByRunId"
  | "runItemOutputIdsByRunItemId"
  | "runItemOutputPagesByRunItemId"
  | "runItemOutputsById"
  | "runItemsById"
  | "transcript"
  | "updateUserMessage"
> & {
  messages?: ChatMessage[];
  runItemOutputPagesByRunItemId?: ChatTranscriptProps["runItemOutputPagesByRunItemId"];
  runItemOutputs?: RunItemOutput[];
  runItems?: RunItem[];
  transcript?: TranscriptTurn[];
  updateUserMessage?: ChatTranscriptProps["updateUserMessage"];
}) {
  const normalized = normalizedTranscriptFixture(messages, runItems, runItemOutputs);
  return (
    <ChatTranscript
      {...props}
      messageIds={normalized.messageIds}
      messagesById={normalized.messagesById}
      runItemIdsByRunId={normalized.runItemIdsByRunId}
      runItemOutputIdsByRunItemId={normalized.runItemOutputIdsByRunItemId}
      runItemOutputPagesByRunItemId={runItemOutputPagesByRunItemId}
      runItemOutputsById={normalized.runItemOutputsById}
      runItemsById={normalized.runItemsById}
      transcript={transcript ?? transcriptFromMessages(messages)}
      updateUserMessage={updateUserMessage}
    />
  );
}

function normalizedTranscriptFixture(
  messages: ChatMessage[],
  runItems: RunItem[],
  runItemOutputs: RunItemOutput[],
) {
  const orderedMessages = messages.toSorted((left, right) => left.ordinal - right.ordinal);
  const messagesById = Object.fromEntries(orderedMessages.map((message) => [message.id, message]));
  const orderedItems = runItems.toSorted(compareRunItems);
  const runItemsById = Object.fromEntries(orderedItems.map((item) => [item.id, item]));
  const runItemIdsByRunId: Record<string, string[]> = {};
  for (const item of orderedItems) {
    runItemIdsByRunId[item.runId] = [...(runItemIdsByRunId[item.runId] ?? []), item.id];
  }
  const orderedOutputs = runItemOutputs.toSorted(compareRunItemOutputs);
  const runItemOutputsById = Object.fromEntries(
    orderedOutputs.map((output) => [output.id, output]),
  );
  const runItemOutputIdsByRunItemId: Record<string, string[]> = {};
  for (const output of orderedOutputs) {
    runItemOutputIdsByRunItemId[output.runItemId] = [
      ...(runItemOutputIdsByRunItemId[output.runItemId] ?? []),
      output.id,
    ];
  }
  return {
    messageIds: orderedMessages.map((message) => message.id),
    messagesById,
    runItemIdsByRunId,
    runItemOutputIdsByRunItemId,
    runItemOutputsById,
    runItemsById,
  };
}

function compareRunItems(left: RunItem, right: RunItem) {
  if (left.createdAt === right.createdAt) {
    return left.id.localeCompare(right.id);
  }
  return left.createdAt.localeCompare(right.createdAt);
}

function compareRunItemOutputs(left: RunItemOutput, right: RunItemOutput) {
  if (left.runItemId === right.runItemId) {
    return left.ordinal - right.ordinal;
  }
  return left.runItemId.localeCompare(right.runItemId);
}

function transcriptFromMessages(messages: ChatMessage[]): TranscriptTurn[] {
  const messagesByRunId = new Map<string, ChatMessage[]>();
  for (const message of messages) {
    if (message.runId === "") {
      continue;
    }
    messagesByRunId.set(message.runId, [...(messagesByRunId.get(message.runId) ?? []), message]);
  }
  return Array.from(messagesByRunId.entries()).map(([runId, runMessages]) => {
    const triggerMessage =
      runMessages.find((message) => message.role === "user") ??
      chatUserMessage(`message_user_${runId}`, 1, runId);
    const assistantMessage = runMessages.find((message) => message.role === "assistant") ?? null;
    return {
      assistantMessage,
      run: transcriptRun(runId, triggerMessage.id, assistantMessage?.id ?? ""),
      steeringMessages: runMessages.filter((message) => message.delivery === "steering"),
      triggerMessage,
    };
  });
}

function transcriptRun(runId: string, triggerMessageId: string, assistantMessageId: string): Run {
  return {
    assistantMessageId,
    completedAt: assistantMessageId ? "2026-05-29T20:01:00Z" : "",
    conversationId: "conversation_api",
    error: "",
    harness: "codex",
    id: runId,
    pendingApproval: null,
    promptSummary: "test",
    schemaVersion: 1,
    startedAt: assistantMessageId ? "2026-05-29T20:00:00Z" : "",
    status: assistantMessageId ? "completed" : "queued",
    triggerMessageId,
    workspaceId: "workspace_api",
  };
}

function chatUserMessage(id: string, ordinal: number, runId: string): ChatMessage {
  return {
    conversationId: "conversation_api",
    createdAt: "2026-05-29T20:00:00Z",
    delivery: "normal",
    id,
    ordinal,
    parts: [{ format: "plain", id: `${id}_part`, text: "prompt", type: "text" }],
    role: "user",
    runId,
    schemaVersion: 1,
    status: "complete",
    updatedAt: "2026-05-29T20:00:00Z",
  };
}

function rowCount(html: string, testId: string) {
  return html.split(`data-testid="${testId}"`).length - 1;
}

function workspacePaneStates(count: number): WorkspacePaneState[] {
  return Array.from({ length: count }, (_, index) => ({
    activeTabId: `tab_${index}`,
    id: `pane_${index}`,
    tabs: [
      {
        id: `tab_${index}`,
        kind: "chat",
        title: "Chat",
      },
    ],
  }));
}

function conversationListItem(id: string, title: string): ConversationListItem {
  return {
    activeRunId: "",
    conversation: {
      archivedAt: "",
      codexSettings: null,
      createdAt: "2026-05-29T20:00:00Z",
      harnessRefs: [],
      id,
      schemaVersion: 1,
      title,
      updatedAt: "2026-05-29T20:00:00Z",
      workspaceId: "workspace_web",
    },
    messageCount: 0,
  };
}

function emptyCorruption(): CorruptionSummary {
  return {
    byKind: [],
    bySeverity: [],
    hasCorruption: false,
    total: 0,
  };
}

function criticalDiagnostic(conversationId: string): Diagnostic {
  return {
    code: "corrupt_chat_state",
    context: { path: "/tmp/run.json" },
    conversationId,
    id: "diagnostic_api",
    message: "run run_api assistant message message_missing was not found",
    occurredAt: "2026-05-29T20:00:00Z",
    runId: "run_api",
    schemaVersion: 1,
    severity: "critical",
    source: "chat",
    workspaceId: "workspace_web",
  };
}

function chatMessage(id: string, ordinal: number): ChatMessage {
  return {
    conversationId: "conversation_api",
    createdAt: "2026-05-29T20:00:00Z",
    delivery: "normal",
    id,
    ordinal,
    parts: [{ format: "markdown", id: `${id}_part`, text: `message ${ordinal}`, type: "text" }],
    role: "assistant",
    runId: `run_${id}`,
    schemaVersion: 1,
    status: "complete",
    updatedAt: "2026-05-29T20:00:00Z",
  };
}
