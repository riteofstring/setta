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
import { beforeEach, describe, expect, test } from "vitest";

import { App, sidebarWorkspaceBusy } from "./App";
import { compactPaneWidth } from "./app-layout";
import { ChatTranscript, type ChatTranscriptProps } from "./components/chat-transcript";
import { WorkspaceSidebar } from "./components/workspace-sidebar";
import { useAppearanceStore } from "./stores/appearance-store";
import { useChatStore } from "./stores/chat-store";

beforeEach(() => {
  useAppearanceStore.setState(useAppearanceStore.getInitialState(), true);
  useChatStore.setState(useChatStore.getInitialState(), true);
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

  test("renders the real niri workspace inside the preserved shell", () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        setta: {
          app: {
            flags: {
              pixiWorkspaceDebug: false,
              pixiWorkspaceSyntheticGraph: null,
            },
            platform: "darwin",
          },
          backend: { onEventStreamStatus: () => () => {} },
          chat: { onEvent: () => () => {} },
        },
      },
    });

    const html = renderToString(<App />);

    expect(html).toContain('data-testid="shell-top-bar"');
    expect(html).toContain('data-setta-shell-title-bar="true"');
    expect(html).toContain("pointer-events-auto fixed top-0 z-30 h-10");
    expect(html).not.toContain("app-drag pointer-events-auto fixed top-0 z-30 h-10");
    expect(html).toContain("left-[74px] right-0");
    expect(html).toContain('data-testid="shell-setta-logo"');
    expect(html).toContain("app-drag pointer-events-none");
    expect(html).toContain('aria-label="Hide project sidebar"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('data-testid="project-sidebar-toggle"');
    expect(html).toContain("app-no-drag pointer-events-auto fixed top-1 z-50");
    expect(html).toContain('data-testid="niri-workspace-area"');
    expect(html).toContain('data-desktop-platform="darwin"');
    expect(html).toContain('data-testid="niri-presentation-engine"');
    expect(rowCount(html, "niri-fake-pane-host")).toBe(18);
    expect(html).toContain('data-pane-count="6"');
    expect(html).toContain('data-workspace-mode="workspace"');
    expect(html).not.toContain('data-testid="niri-workspace-status"');
    expect(html).not.toContain('data-testid="niri-benchmark-status"');
    expect(html).not.toContain('data-testid="niri-performance-stats"');
    expect(html).toContain('data-testid="niri-workspace-toolbar"');
    expect(html).toContain('class="niri-workspace-toolbar"');
    expect(html).toContain("niri-workspace-toolbar-button app-no-drag");
    expect(html).not.toContain('data-testid="workspace-pane-grid-shell"');
    expect(html).not.toContain('data-testid="bottom-workspace-pane"');
    expect(html).not.toContain('data-testid="right-workspace-pane"');
    expect(html).toContain("bg-background");
  });

  test("renders a full-width shell drag strip on non-mac platforms", () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        setta: {
          app: {
            flags: {
              pixiWorkspaceDebug: false,
              pixiWorkspaceSyntheticGraph: null,
            },
            platform: "win32",
          },
          backend: { onEventStreamStatus: () => () => {} },
          chat: { onEvent: () => () => {} },
        },
      },
    });

    const html = renderToString(<App />);

    expect(html).toContain('data-testid="shell-top-bar"');
    expect(html).toContain('data-setta-shell-title-bar="true"');
    expect(html).toContain("pointer-events-auto fixed top-0 z-30 h-10");
    expect(html).not.toContain("app-drag pointer-events-auto fixed top-0 z-30 h-10");
    expect(html).toContain("inset-x-0");
    expect(html).toContain('data-desktop-platform="win32"');
    expect(html).toContain('aria-label="Hide project sidebar"');
  });

  test("caps project pane widths at compact viewport sizes without growing stored widths", () => {
    expect(compactPaneWidth(360, 560, 128, 0.28)).toBe(156);
    expect(compactPaneWidth(140, 560, 128, 0.28)).toBe(140);
    expect(compactPaneWidth(360, 900, 128, 0.28)).toBe(360);
  });

  test("renders the empty workspace state", () => {
    const html = renderToString(
      <WorkspaceSidebar
        activeRun={null}
        activeWorkspaces={[]}
        busy={false}
        closeWorkspace={async () => {}}
        createConversation={async () => {}}
        createWorkspaceConversation={async () => {}}
        deleteConversation={async () => {}}
        openLocalFolder={async () => {}}
        openWorkspacePath={async () => {}}
        openSettingsPane={() => {}}
        recentWorkspaces={[]}
        removeRecent={async () => {}}
        selectConversation={async () => {}}
        selectWorkspace={async () => {}}
        selectedConversationId=""
        selectedWorkspaceId=""
        setConversationPinned={async () => {}}
      />,
    );

    expect(html).toContain("Shortcuts");
    expect(html).toContain("Projects");
    expect(hasAriaLabel(html, "New chat")).toBe(true);
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
        activeRun={null}
        activeWorkspaces={[api, web]}
        busy={false}
        closeWorkspace={async () => {}}
        createConversation={async () => {}}
        createWorkspaceConversation={async () => {}}
        deleteConversation={async () => {}}
        openLocalFolder={async () => {}}
        openWorkspacePath={async () => {}}
        openSettingsPane={() => {}}
        recentWorkspaces={[web, api]}
        removeRecent={async () => {}}
        selectConversation={async () => {}}
        selectWorkspace={async () => {}}
        selectedConversationId=""
        selectedWorkspaceId="workspace_web"
        setConversationPinned={async () => {}}
      />,
    );

    expect(html).toContain("web");
    expect(hasAriaLabel(html, "Projects")).toBe(true);
    expect(hasAriaLabel(html, "New chat in web")).toBe(true);
    expect(html).toContain("Build web UI");
  });

  test("does not render stale chat conversations while switching workspaces", () => {
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
      conversationListItem("conversation_api", "Old API chat", "workspace_api"),
    ]);
    const html = renderToString(
      <WorkspaceSidebar
        activeRun={null}
        activeWorkspaces={[api, web]}
        busy={false}
        closeWorkspace={async () => {}}
        createConversation={async () => {}}
        createWorkspaceConversation={async () => {}}
        deleteConversation={async () => {}}
        openLocalFolder={async () => {}}
        openWorkspacePath={async () => {}}
        openSettingsPane={() => {}}
        recentWorkspaces={[]}
        removeRecent={async () => {}}
        selectConversation={async () => {}}
        selectWorkspace={async () => {}}
        selectedConversationId=""
        selectedWorkspaceId="workspace_web"
        setConversationPinned={async () => {}}
      />,
    );

    expect(html).toContain("web");
    expect(html).not.toContain("Old API chat");
    expect(html).not.toContain("Loading chats");
  });

  test("keeps sidebar actions available while selecting a ready workspace", () => {
    expect(sidebarWorkspaceBusy("selecting", "ready")).toBe(false);
    expect(sidebarWorkspaceBusy("opening", "ready")).toBe(true);
    expect(sidebarWorkspaceBusy(null, "loading")).toBe(true);
    expect(sidebarWorkspaceBusy(null, "ready")).toBe(false);
  });

  test("renders chat corruption status in the project and conversation list", () => {
    const web = {
      displayName: "web",
      id: "workspace_web",
      lastOpenedAt: "2026-05-29T20:05:00Z",
      rootPath: "/tmp/web",
    };
    seedWorkspaceConversationList(
      "workspace_web",
      [conversationListItem("conversation_web", "Build web UI", "workspace_web")],
      {
        corruption: {
          byKind: [{ count: 2, key: "run" }],
          bySeverity: [{ count: 2, key: "critical" }],
          hasCorruption: true,
          total: 2,
        },
        diagnostics: [criticalDiagnostic("conversation_web")],
      },
    );
    const html = renderToString(
      <WorkspaceSidebar
        activeRun={null}
        activeWorkspaces={[web]}
        busy={false}
        closeWorkspace={async () => {}}
        createConversation={async () => {}}
        createWorkspaceConversation={async () => {}}
        deleteConversation={async () => {}}
        openLocalFolder={async () => {}}
        openWorkspacePath={async () => {}}
        openSettingsPane={() => {}}
        recentWorkspaces={[]}
        removeRecent={async () => {}}
        selectConversation={async () => {}}
        selectWorkspace={async () => {}}
        selectedConversationId="conversation_web"
        selectedWorkspaceId="workspace_web"
        setConversationPinned={async () => {}}
      />,
    );

    expect(html).toContain('role="status"');
    expect(hasAriaLabelContaining(html, "2 corrupt chat records detected")).toBe(true);
    expect(hasAriaLabelContaining(html, "1 corrupt chat record detected")).toBe(true);
    expect(html).toContain("Malformed chat data");
    expect(html).toContain("2 corrupt chat records detected");
    expect(html).toContain("1 corrupt chat record detected");
    expect(html).toContain("assistant message message_missing was not found");
    expect(html).toContain("Path: /tmp/run.json");
  });

  test("bounds large workspace list row rendering", () => {
    const workspaces = Array.from({ length: 3000 }, (_, index) => ({
      displayName: `Workspace ${index}`,
      id: `workspace_${index}`,
      lastOpenedAt: "2026-05-29T20:00:00Z",
      rootPath: `/tmp/workspace-${index}`,
    }));
    seedWorkspaceConversationList("workspace_0", [
      conversationListItem("conversation_workspace_0", "Large workspace chat", "workspace_0"),
    ]);

    const html = renderToString(
      <WorkspaceSidebar
        activeRun={null}
        activeWorkspaces={workspaces}
        busy={false}
        closeWorkspace={async () => {}}
        createConversation={async () => {}}
        createWorkspaceConversation={async () => {}}
        deleteConversation={async () => {}}
        openLocalFolder={async () => {}}
        openWorkspacePath={async () => {}}
        openSettingsPane={() => {}}
        recentWorkspaces={workspaces}
        removeRecent={async () => {}}
        selectConversation={async () => {}}
        selectWorkspace={async () => {}}
        selectedConversationId="conversation_workspace_0"
        selectedWorkspaceId="workspace_0"
        setConversationPinned={async () => {}}
      />,
    );

    expect(rowCount(html, "active-workspace-item")).toBeLessThan(30);
    expect(rowCount(html, "recent-workspace-item")).toBeLessThan(30);
    expect(html).toContain("Large workspace chat");
  });
});

describe("chat renderer states", () => {
  test("renders markdown messages without trusting raw html", () => {
    const longToken = "x".repeat(160);
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
                text: `**Done** \`<script>\`\n\n\`\`\`\n${longToken}\n\`\`\``,
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
    expect(html).toContain("[overflow-wrap:anywhere]");
    expect(html).not.toContain("overflow-x-auto");
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
  }, 30_000);

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
            text: `ok\n${"x".repeat(160)}\n`,
          },
        ]}
        runItems={[
          {
            command: `go test ./... ${"x".repeat(160)}`,
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
        ]}
        submitApproval={async () => {}}
      />,
    );

    expect(html).toContain("Queued");
    expect(html).toContain('aria-label="Edit queued message"');
    expect(html).toContain('aria-label="Confirm queued message removal"');
    expect(html).toContain("Steering");
    expect(html).toContain("go test ./...");
    expect(html).toContain("main.go");
    expect(html).toContain("halfway");
    expect(html).toContain("warning text");
    expect(html).not.toContain("overflow-x-auto");
    expect(html).not.toContain("overflow-auto");
    expect(htmlScopeForTestId(html, "chat-assistant-message-content")).not.toContain(
      'data-testid="run-activity-group"',
    );
  });

  test("renders message actions outside content and timestamps only at speaker group boundaries", () => {
    const html = renderToString(
      <TestChatTranscript
        activeRun={null}
        hasMoreOlder={false}
        loadOlder={async () => {}}
        loadRunItemOutput={async () => {}}
        messages={[
          chatUserMessageWithText("message_user_1", 1, "", "normal", "First prompt"),
          chatUserMessageWithText("message_user_2", 2, "", "normal", "Second prompt"),
          chatAssistantMessage("message_assistant_1", 3, "", "First answer"),
          chatAssistantMessage("message_assistant_2", 4, "", "Second answer"),
          chatUserMessageWithText("message_user_3", 5, "", "normal", "Third prompt"),
        ]}
        runItemOutputs={[]}
        runItems={[]}
        submitApproval={async () => {}}
      />,
    );

    expect(rowCount(html, "chat-message-timestamp")).toBe(3);
    expect(rowCount(html, "chat-message-actions")).toBe(5);
    expect(htmlScopeForTestId(html, "chat-message-timestamp")).toContain("text-foreground/60");
    expect(htmlScopeForTestId(html, "chat-message-timestamp")).toContain("opacity-100");
    expect(htmlScopeForTestId(html, "chat-message-timestamp")).not.toContain("opacity-0");
    expect(html).toContain("max-w-[82%]");
    expect(html).toContain("max-w-[88%]");
    expect(html).not.toContain("md:max-w-5xl");
    expect(html).toContain('aria-label="Copy message"');
    expect(html).toContain('aria-label="Retry message by forking conversation"');
    expect(htmlScopeForTestId(html, "chat-user-message-content")).not.toContain(
      'aria-label="Copy message"',
    );
    expect(htmlScopeForTestId(html, "chat-assistant-message-content")).not.toContain(
      'aria-label="Retry message by forking conversation"',
    );
  });

  test("renders immediate steering action only for pending steering on the active run", () => {
    const activeRun = {
      ...transcriptRun("run_api", "message_user_run_api", ""),
      startedAt: "2026-05-29T20:00:00Z",
      status: "running",
    } satisfies Run;

    const html = renderToString(
      <TestChatTranscript
        activeRun={activeRun}
        hasMoreOlder={false}
        loadOlder={async () => {}}
        loadRunItemOutput={async () => {}}
        messages={[
          chatUserMessage("message_user_run_api", 1, activeRun.id),
          {
            conversationId: "conversation_api",
            createdAt: "2026-05-29T20:00:00Z",
            delivery: "steering",
            id: "message_steering",
            ordinal: 2,
            parts: [{ format: "plain", id: "part_steering", text: "steer", type: "text" }],
            role: "user",
            runId: activeRun.id,
            schemaVersion: 1,
            status: "pending",
            updatedAt: "2026-05-29T20:00:00Z",
          },
        ]}
        runItemOutputs={[]}
        runItems={[]}
        submitApproval={async () => {}}
      />,
    );

    expect(html).toContain("Steering pending");
    expect(html).toContain('aria-label="Interrupt and send pending steering"');
  });

  test("renders pending steering after active assistant output", () => {
    const activeRun = {
      ...transcriptRun("run_active", "message_active_user", "message_active_assistant"),
      completedAt: "",
      status: "running",
    } satisfies Run;
    const messages = [
      chatUserMessageWithText("message_active_user", 1, activeRun.id, "normal", "Active prompt"),
      chatAssistantMessage(
        "message_active_assistant",
        2,
        activeRun.id,
        "Assistant partial",
        "streaming",
      ),
      chatUserMessageWithText(
        "message_steering",
        3,
        activeRun.id,
        "steering",
        "Steering prompt",
        "pending",
      ),
    ];

    const html = renderToString(
      <TestChatTranscript
        activeRun={activeRun}
        hasMoreOlder={false}
        loadOlder={async () => {}}
        loadRunItemOutput={async () => {}}
        messages={messages}
        runItemOutputs={[]}
        runItems={[]}
        submitApproval={async () => {}}
      />,
    );

    expectTextOrder(html, [
      "Active prompt",
      "Assistant partial",
      "Steering prompt",
      "Steering pending",
    ]);
  });

  test("renders promoted queued turns after immediate steering replay", () => {
    const messages = [
      chatUserMessageWithText("message_active_user", 1, "run_active", "normal", "Active prompt"),
      chatAssistantMessage("message_active_assistant", 2, "run_active", "Active partial"),
      chatUserMessageWithText("message_queued_user", 3, "run_queue", "queued", "Queued prompt"),
      chatUserMessageWithText("message_steer_user", 4, "run_steer", "normal", "Steering prompt"),
      chatAssistantMessage("message_steer_assistant", 5, "run_steer", "Steering answer"),
      chatAssistantMessage("message_queued_assistant", 6, "run_queue", "Queued answer"),
    ];

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

    expectTextOrder(html, [
      "Active prompt",
      "Active partial",
      "Steering prompt",
      "Steering answer",
      "Queued prompt",
      "Queued answer",
    ]);
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

  test("renders tool messages as styled raw output", () => {
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
            id: "message_tool",
            ordinal: 1,
            parts: [
              {
                format: "plain",
                id: "message_tool_part",
                text: '{"tool":"style_probe","ok":true,"rows":17}',
                type: "text",
              },
            ],
            role: "tool",
            runId: "",
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
    const scope = htmlScopeForTestId(html, "chat-tool-message-content");

    expect(scope).toContain("border-cyan-400");
    expect(scope).toContain("font-mono");
    expect(scope).toContain("<pre");
    expect(scope).toContain("&quot;style_probe&quot;");
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

const defaultTestChatTranscriptOptions = {
  editQueuedMessage: async () => {},
  editingQueuedMessageId: null,
  messages: [] as ChatMessage[],
  operation: null,
  removeQueuedMessage: async () => {},
  removingQueuedMessageId: null,
  runItemOutputPagesByRunItemId: {},
  runItemOutputs: [] as RunItemOutput[],
  runItems: [] as RunItem[],
  sendSteeringImmediately: async () => {},
};

type TestChatTranscriptProps = Omit<
  ChatTranscriptProps,
  | "messageIds"
  | "messagesById"
  | "editQueuedMessage"
  | "editingQueuedMessageId"
  | "operation"
  | "removeQueuedMessage"
  | "removingQueuedMessageId"
  | "runItemIdsByRunId"
  | "runItemOutputIdsByRunItemId"
  | "runItemOutputPagesByRunItemId"
  | "runItemOutputsById"
  | "runItemsById"
  | "sendSteeringImmediately"
  | "transcript"
> & {
  editQueuedMessage?: ChatTranscriptProps["editQueuedMessage"];
  editingQueuedMessageId?: ChatTranscriptProps["editingQueuedMessageId"];
  messages?: ChatMessage[];
  operation?: ChatTranscriptProps["operation"];
  removeQueuedMessage?: ChatTranscriptProps["removeQueuedMessage"];
  removingQueuedMessageId?: ChatTranscriptProps["removingQueuedMessageId"];
  runItemOutputPagesByRunItemId?: ChatTranscriptProps["runItemOutputPagesByRunItemId"];
  runItemOutputs?: RunItemOutput[];
  runItems?: RunItem[];
  sendSteeringImmediately?: ChatTranscriptProps["sendSteeringImmediately"];
  transcript?: TranscriptTurn[];
};

function TestChatTranscript(props: TestChatTranscriptProps) {
  const options = { ...defaultTestChatTranscriptOptions, ...props };
  const normalized = normalizedTranscriptFixture(
    options.messages,
    options.runItems,
    options.runItemOutputs,
  );
  return (
    <ChatTranscript
      {...options}
      editQueuedMessage={options.editQueuedMessage}
      editingQueuedMessageId={options.editingQueuedMessageId}
      messageIds={normalized.messageIds}
      messagesById={normalized.messagesById}
      operation={options.operation}
      removeQueuedMessage={options.removeQueuedMessage}
      removingQueuedMessageId={options.removingQueuedMessageId}
      runItemIdsByRunId={normalized.runItemIdsByRunId}
      runItemOutputIdsByRunItemId={normalized.runItemOutputIdsByRunItemId}
      runItemOutputPagesByRunItemId={options.runItemOutputPagesByRunItemId}
      runItemOutputsById={normalized.runItemOutputsById}
      runItemsById={normalized.runItemsById}
      sendSteeringImmediately={options.sendSteeringImmediately}
      transcript={options.transcript ?? transcriptFromMessages(options.messages)}
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
  const runIds = [...new Set(messages.map((message) => message.runId).filter(Boolean))];
  return runIds.map((runId) => {
    const triggerMessage =
      messages.find((message) => message.runId === runId && message.role === "user") ??
      chatUserMessage(`message_user_${runId}`, 1, runId);
    const assistantMessage =
      messages.find((message) => message.runId === runId && message.role === "assistant") ?? null;
    return {
      assistantMessage,
      run: transcriptRun(runId, triggerMessage.id, assistantMessage?.id ?? ""),
      steeringMessages: messages.filter(
        (message) => message.runId === runId && message.delivery === "steering",
      ),
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
  return chatUserMessageWithText(id, ordinal, runId, "normal", "prompt");
}

function chatUserMessageWithText(
  id: string,
  ordinal: number,
  runId: string,
  delivery: ChatMessage["delivery"],
  text: string,
  status: ChatMessage["status"] = "complete",
): ChatMessage {
  return {
    conversationId: "conversation_api",
    createdAt: "2026-05-29T20:00:00Z",
    delivery,
    id,
    ordinal,
    parts: [{ format: "plain", id: `${id}_part`, text, type: "text" }],
    role: "user",
    runId,
    schemaVersion: 1,
    status,
    updatedAt: "2026-05-29T20:00:00Z",
  };
}

function chatAssistantMessage(
  id: string,
  ordinal: number,
  runId: string,
  text: string,
  status: ChatMessage["status"] = "complete",
): ChatMessage {
  return {
    conversationId: "conversation_api",
    createdAt: "2026-05-29T20:00:00Z",
    delivery: "normal",
    id,
    ordinal,
    parts: [{ format: "markdown", id: `${id}_part`, text, type: "text" }],
    role: "assistant",
    runId,
    schemaVersion: 1,
    status,
    updatedAt: "2026-05-29T20:00:00Z",
  };
}

function rowCount(html: string, testId: string) {
  return html.split(`data-testid="${testId}"`).length - 1;
}

function htmlScopeForTestId(html: string, testId: string) {
  const attributeIndex = html.indexOf(`data-testid="${testId}"`);
  expect(attributeIndex).toBeGreaterThanOrEqual(0);
  const startIndex = html.lastIndexOf("<", attributeIndex);
  const openingEndIndex = html.indexOf(">", attributeIndex);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(openingEndIndex).toBeGreaterThanOrEqual(0);

  let depth = 1;
  let cursor = openingEndIndex;
  while (depth > 0) {
    const tagStartIndex = html.indexOf("<", cursor + 1);
    expect(tagStartIndex).toBeGreaterThanOrEqual(0);
    const tagEndIndex = html.indexOf(">", tagStartIndex);
    expect(tagEndIndex).toBeGreaterThanOrEqual(0);
    const tag = html.slice(tagStartIndex, tagEndIndex + 1);
    if (tag.startsWith("</")) {
      depth -= 1;
    } else if (!tag.startsWith("<!") && !tag.endsWith("/>") && !isVoidHtmlTag(tag)) {
      depth += 1;
    }
    cursor = tagEndIndex;
  }

  return html.slice(startIndex, cursor + 1);
}

function isVoidHtmlTag(tag: string) {
  const tagName = /^<\s*([^\s>/]+)/.exec(tag)?.[1]?.toLowerCase();
  return tagName ? voidHtmlTags.has(tagName) : false;
}

const voidHtmlTags = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

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

function expectTextOrder(html: string, texts: string[]) {
  let previousIndex = -1;
  for (const text of texts) {
    const index = html.indexOf(text);
    expect(index).toBeGreaterThan(previousIndex);
    previousIndex = index;
  }
}

function seedWorkspaceConversationList(
  workspaceId: string,
  conversations: ConversationListItem[],
  options: {
    corruption?: CorruptionSummary;
    diagnostics?: Diagnostic[];
    error?: string | null;
    loading?: boolean;
  } = {},
) {
  useChatStore.setState((current) => ({
    conversationListsByWorkspaceId: {
      ...current.conversationListsByWorkspaceId,
      [workspaceId]: {
        conversations,
        corruption: options.corruption ?? emptyCorruption(),
        diagnostics: options.diagnostics ?? [],
        error: options.error ?? null,
        loading: options.loading ?? false,
      },
    },
  }));
}

function conversationListItem(
  id: string,
  title: string,
  workspaceId = "workspace_web",
): ConversationListItem {
  return {
    activeRunId: "",
    pinnedAt: "",
    conversation: {
      archivedAt: "",
      codexSettings: null,
      createdAt: "2026-05-29T20:00:00Z",
      harnessRefs: [],
      id,
      internal: false,
      schemaVersion: 1,
      title,
      updatedAt: "2026-05-29T20:00:00Z",
      workflow: null,
      workspaceId,
    },
    latestReadRelevantMarker: 0,
    messageCount: 0,
    readMarker: 0,
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
