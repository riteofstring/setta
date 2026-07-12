import type {
  ChatMessage,
  ConversationListItem,
  NavigatorItem,
  Run,
  RunLiveness,
  RunItemOutput,
  TranscriptBlock,
} from "@generated/backend";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, test } from "vitest";

import { App, sidebarWorkspaceBusy } from "./App";
import { activityDetails, queuedChatMessage } from "./App.test.fixtures";
import { compactPaneWidth } from "./app-layout";
import {
  ChatTranscript,
  transcriptVirtualItemKey,
  type ChatTranscriptProps,
} from "./components/chat-transcript";
import { WorkspaceSidebar } from "./components/workspace-sidebar";
import { useAppearanceStore } from "./stores/appearance-store";
import { useChatStore } from "./stores/chat-store";
import { useConversationNavigatorStore } from "./stores/conversation-navigator-store";
import { useConversationPaneStore } from "./stores/conversation-pane-store";
import {
  activityBlock,
  assistantTextBlock,
  reasoningBlock,
  runStatusBlock,
  userMessageBlock,
} from "./stores/chat-store-events.test.helpers";

beforeEach(() => {
  useAppearanceStore.setState(useAppearanceStore.getInitialState(), true);
  useChatStore.setState(useChatStore.getInitialState(), true);
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
          app: {
            flags: {
              workflowGraphDebug: false,
              workflowGraphSyntheticGraph: null,
            },
            platform: "darwin",
          },
          backend: { onEventStreamStatus: () => () => {}, onProcessStatus: () => () => {} },
          chat: { onEvent: () => () => {} },
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
    expect(html).toContain("Open a workspace");
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
          app: {
            flags: {
              workflowGraphDebug: false,
              workflowGraphSyntheticGraph: null,
            },
            platform: "win32",
          },
          backend: { onEventStreamStatus: () => () => {}, onProcessStatus: () => () => {} },
          chat: { onEvent: () => () => {} },
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

  test("renders the empty workspace state", () => {
    const html = renderToString(
      <WorkspaceSidebar
        activeWorkspaces={[]}
        busy={false}
        closeWorkspace={async () => {}}
        openLocalFolder={async () => {}}
        openWorkspacePath={async () => {}}
        openSettingsPane={() => {}}
        presentConversation={async () => {}}
        recentWorkspaces={[]}
        removeRecent={async () => {}}
        selectWorkspace={async () => {}}
        selectedWorkspaceId=""
      />,
    );

    expect(html).toContain("Conversations");
    expect(hasAriaLabel(html, "Search conversations")).toBe(true);
    expect(hasAriaLabel(html, "New chat")).toBe(false);
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
        openLocalFolder={async () => {}}
        openWorkspacePath={async () => {}}
        openSettingsPane={() => {}}
        presentConversation={async () => {}}
        recentWorkspaces={[web, api]}
        removeRecent={async () => {}}
        selectWorkspace={async () => {}}
        selectedWorkspaceId="workspace_web"
      />,
    );

    expect(html).toContain("web");
    expect(hasAriaLabel(html, "Conversations")).toBe(true);
    expect(hasAriaLabel(html, "New chat in web")).toBe(false);
    expect(html).toContain("Build web UI");
  });

  test("renders workspace operation errors in the sidebar", () => {
    const html = renderToString(
      <WorkspaceSidebar
        activeWorkspaces={[]}
        busy={false}
        clearWorkspaceError={() => {}}
        closeWorkspace={async () => {}}
        openLocalFolder={async () => {}}
        openWorkspacePath={async () => {}}
        openSettingsPane={() => {}}
        presentConversation={async () => {}}
        recentWorkspaces={[]}
        removeRecent={async () => {}}
        selectWorkspace={async () => {}}
        selectedWorkspaceId=""
        workspaceError="workspace path does not exist"
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
      conversationListItem("conversation_api", "Old API chat", "workspace_api"),
    ]);
    const html = renderToString(
      <WorkspaceSidebar
        activeWorkspaces={[api, web]}
        busy={false}
        closeWorkspace={async () => {}}
        openLocalFolder={async () => {}}
        openWorkspacePath={async () => {}}
        openSettingsPane={() => {}}
        presentConversation={async () => {}}
        recentWorkspaces={[]}
        removeRecent={async () => {}}
        selectWorkspace={async () => {}}
        selectedWorkspaceId="workspace_web"
      />,
    );

    expect(html).toContain("web");
    expect(html).not.toContain("Old API chat");
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
        openLocalFolder={async () => {}}
        openWorkspacePath={async () => {}}
        openSettingsPane={() => {}}
        presentConversation={async () => {}}
        recentWorkspaces={[]}
        removeRecent={async () => {}}
        selectWorkspace={async () => {}}
        selectedWorkspaceId="workspace_web"
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
        openLocalFolder={async () => {}}
        openWorkspacePath={async () => {}}
        openSettingsPane={() => {}}
        presentConversation={async () => {}}
        recentWorkspaces={[]}
        removeRecent={async () => {}}
        selectWorkspace={async () => {}}
        selectedWorkspaceId="workspace_web"
      />,
    );

    expect(hasAriaLabel(html, "Conversation working")).toBe(true);
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
        openLocalFolder={async () => {}}
        openWorkspacePath={async () => {}}
        openSettingsPane={() => {}}
        presentConversation={async () => {}}
        recentWorkspaces={[]}
        removeRecent={async () => {}}
        selectWorkspace={async () => {}}
        selectedWorkspaceId="workspace_web"
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
      conversationListItem("conversation_workspace_0", "Large workspace chat", "workspace_0"),
    ]);

    const html = renderToString(
      <WorkspaceSidebar
        activeWorkspaces={workspaces}
        busy={false}
        closeWorkspace={async () => {}}
        openLocalFolder={async () => {}}
        openWorkspacePath={async () => {}}
        openSettingsPane={() => {}}
        presentConversation={async () => {}}
        recentWorkspaces={workspaces}
        removeRecent={async () => {}}
        selectWorkspace={async () => {}}
        selectedWorkspaceId="workspace_0"
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
        blocks={[
          assistantTextBlock({
            id: "block_assistant",
            runId: "run_api",
            ordinal: 1,
            status: "complete",
            text: `**Done** \`<script>\`\n\n\`\`\`\n${longToken}\n\`\`\``,
          }),
        ]}
      />,
    );

    expect(html).toContain("<strong");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("[overflow-wrap:anywhere]");
    expect(html).not.toContain("overflow-x-auto");
    expect(html).not.toContain("<script>");
  });

  test("bounds large transcript row rendering", () => {
    const blocks = Array.from({ length: 5000 }, (_, index) =>
      assistantTextBlock({
        id: `block_${index}`,
        runId: "run_api",
        ordinal: index + 1,
        status: "complete",
        text: `message ${index + 1}`,
      }),
    );

    const html = renderToString(<TestChatTranscript blocks={blocks} />);

    expect(rowCount(html, "chat-assistant-turn-row")).toBeLessThanOrEqual(30);
  }, 30_000);

  test("resolves transcript virtual row keys when the virtualizer omits an item", () => {
    const rows = [{ key: "block:one" }, { key: "block:two" }];

    expect(transcriptVirtualItemKey(rows, 0, { key: "block:item" })).toBe("block:item");
    expect(transcriptVirtualItemKey(rows, 1, undefined)).toBe("block:two");
    expect(transcriptVirtualItemKey(rows, 8, undefined)).toBe("transcript-row:8");
  });

  test("renders blocks in provider chronology with a slim activity group, not an outer accordion", () => {
    const html = renderToString(
      <TestChatTranscript
        blocks={[
          userMessageBlock({
            id: "block_user",
            runId: "run_api",
            ordinal: 1,
            text: "inspect the scripts",
          }),
          assistantTextBlock({
            id: "block_text_1",
            runId: "run_api",
            ordinal: 2,
            status: "complete",
            text: "Step one before the commands.",
          }),
          activityBlock({
            id: "block_cmd_a",
            runId: "run_api",
            ordinal: 3,
            sourceRunItemId: "item_a",
            hasDetails: true,
            details: activityDetails({ command: "find . -name '*.sh'" }),
          }),
          activityBlock({
            id: "block_cmd_b",
            runId: "run_api",
            ordinal: 4,
            sourceRunItemId: "item_b",
            hasDetails: true,
            details: activityDetails({ command: "sed -n 1p setup.sh" }),
          }),
          assistantTextBlock({
            id: "block_text_2",
            runId: "run_api",
            ordinal: 5,
            status: "complete",
            text: "Step two after the commands.",
          }),
        ]}
      />,
    );

    expect(html).not.toContain('data-testid="run-activity-group"');
    expect(html).toContain('data-testid="activity-group-header"');
    expect(html).toContain('data-activity-group-expanded="false"');
    expect(rowCount(html, "run-activity-row")).toBe(0);
    expectTextOrder(html, [
      "Step one before the commands.",
      "find . -name &#x27;*.sh&#x27;",
      "Step two after the commands.",
    ]);
    expect(html).not.toContain("sed -n 1p setup.sh");
  });

  test("renders reasoning thinking and summary modes as first-class blocks", () => {
    const html = renderToString(
      <TestChatTranscript
        blocks={[
          reasoningBlock({
            id: "block_thinking",
            runId: "run_api",
            ordinal: 1,
            status: "streaming",
            mode: "thinking",
            headline: "Mapping parser modules",
          }),
          reasoningBlock({
            id: "block_summary",
            runId: "run_api",
            ordinal: 2,
            status: "complete",
            mode: "summary",
            headline: "Caching the projection",
            summary: "Weighed recompute cost against staleness.",
          }),
          assistantTextBlock({
            id: "block_after",
            runId: "run_api",
            ordinal: 3,
            status: "complete",
            text: "Answer after reasoning.",
          }),
        ]}
      />,
    );

    expect(html).toContain("Mapping parser modules");
    expect(html).toContain("Caching the projection");
    expect(html).toContain("Weighed recompute cost against staleness.");
    expect(html).toContain('data-live-headline="active"');
    expectTextOrder(html, [
      "Mapping parser modules",
      "Caching the projection",
      "Answer after reasoning.",
    ]);
  });

  test("renders the live-only working run status indicator", () => {
    const activeRun = runFixture("run_api", "running");
    const html = renderToString(
      <TestChatTranscript
        activeRun={activeRun}
        activeRunLiveness={runLivenessFixture(activeRun, "attached")}
        blocks={[
          runStatusBlock({
            id: "block_working",
            runId: "run_api",
            ordinal: 1,
            status: "streaming",
            mode: "working",
            label: "Working",
          }),
        ]}
      />,
    );

    expect(html).toContain('data-run-status-mode="working"');
    expect(html).toContain('data-live-headline="active"');
    expect(html).toContain("Working");
  });

  test("renders snapshot-load verification as reconnecting", () => {
    const activeRun = runFixture("run_api", "running");
    const html = renderToString(
      <TestChatTranscript
        activeRun={activeRun}
        activeRunLiveness={runLivenessFixture(activeRun, "reconciling", {
          reason: "snapshot_load",
          retryable: true,
        })}
        blocks={[
          runStatusBlock({
            id: "block_working",
            runId: "run_api",
            ordinal: 1,
            status: "streaming",
            mode: "working",
            label: "Working",
          }),
        ]}
      />,
    );

    expect(html).toContain('data-run-status-mode="reconnecting"');
    expect(html).toContain("Reconnecting");
    expect(html).not.toContain('data-live-headline="active"');
  });

  test("renders stream resync as reconnecting without the normal working indicator", () => {
    const activeRun = runFixture("run_api", "running");
    const html = renderToString(
      <TestChatTranscript
        activeRun={activeRun}
        activeRunLiveness={runLivenessFixture(activeRun, "reconciling", {
          reason: "stream_resync",
        })}
        blocks={[
          runStatusBlock({
            id: "block_working",
            runId: "run_api",
            ordinal: 1,
            status: "streaming",
            mode: "working",
            label: "Working",
          }),
        ]}
      />,
    );

    expect(html).toContain('data-run-status-mode="reconnecting"');
    expect(html).toContain("Reconnecting");
    expect(html).not.toContain('data-live-headline="active"');
  });

  test("renders lost run status without the normal working indicator", () => {
    const activeRun = runFixture("run_api", "running");
    const html = renderToString(
      <TestChatTranscript
        activeRun={activeRun}
        activeRunLiveness={runLivenessFixture(activeRun, "lost", { error: "thread/read failed" })}
        blocks={[
          runStatusBlock({
            id: "block_working",
            runId: "run_api",
            ordinal: 1,
            status: "streaming",
            mode: "working",
            label: "Working",
          }),
        ]}
      />,
    );

    expect(html).toContain('data-run-status-mode="lost"');
    expect(html).toContain("Connection lost");
    expect(html).toContain("thread/read failed");
    expect(html).not.toContain('data-live-headline="active"');
  });

  test("renders queued, steering, and slim activity rows", () => {
    const html = renderToString(
      <TestChatTranscript
        blocks={[
          assistantTextBlock({
            id: "block_assistant",
            runId: "run_api",
            ordinal: 1,
            status: "complete",
            text: "done",
          }),
          activityBlock({
            id: "block_command",
            runId: "run_api",
            ordinal: 2,
            sourceRunItemId: "item_command",
            activityStatus: "completed",
            hasDetails: true,
            hasOutput: true,
            details: activityDetails({
              command: `go test ./... ${"x".repeat(160)}`,
              cwd: "/tmp/workspace",
              durationMs: 10,
            }),
          }),
          activityBlock({
            id: "block_file",
            runId: "run_api",
            ordinal: 3,
            sourceRunItemId: "item_file",
            title: "file change",
            type: "file_change",
            activityStatus: "running",
            hasDetails: true,
            details: activityDetails({
              filePaths: ["/tmp/workspace/main.go"],
              patchStatus: "updated",
            }),
          }),
          activityBlock({
            id: "block_mcp",
            runId: "run_api",
            ordinal: 4,
            sourceRunItemId: "item_mcp",
            title: "tool",
            type: "mcp_tool_call",
            activityStatus: "running",
            hasDetails: true,
            details: activityDetails({
              progress: "halfway",
              serverName: "server",
              toolName: "tool",
            }),
          }),
          activityBlock({
            id: "block_notice",
            runId: "run_api",
            ordinal: 5,
            sourceRunItemId: "item_notice",
            title: "warning",
            type: "notice",
            hasDetails: true,
            details: activityDetails({ noticeKind: "warning", noticeMessage: "warning text" }),
          }),
          userMessageBlock({
            id: "block_steer",
            runId: "run_api",
            ordinal: 6,
            delivery: "steering",
            text: "steer",
          }),
        ]}
        queuedMessages={[queuedChatMessage("message_queued", "run_queue", "queued")]}
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
      />,
    );

    expect(html).toContain("Queued");
    expect(html).toContain('aria-label="Edit queued message"');
    expect(html).toContain('aria-label="Confirm queued message removal"');
    expect(html).toContain("Steering");
    expect(html).toContain('data-testid="activity-group-header"');
    expect(html).toContain('data-activity-group-expanded="false"');
    expect(rowCount(html, "run-activity-row")).toBe(0);
    expect(html).toContain("main.go");
    expect(html).not.toContain("go test ./...");
    expect(html).not.toContain("halfway");
    expect(html).not.toContain("warning text");
    expect(html).not.toContain('data-testid="run-activity-group"');
    expect(html).not.toContain("overflow-x-auto");
    expect(html).not.toContain("overflow-auto");
  });

  test("renders only projected transcript blocks", () => {
    const html = renderToString(
      <TestChatTranscript
        blocks={[
          userMessageBlock({ id: "block_user", runId: "run_api", ordinal: 1, text: "Hi" }),
          assistantTextBlock({
            id: "block_assistant",
            runId: "run_api",
            ordinal: 2,
            status: "complete",
            text: "Hello once.",
          }),
        ]}
      />,
    );

    expect(html).not.toContain('data-testid="run-activity-group"');
    expect(html).not.toContain("Reasoning summary");
    expect(html).toContain("Hello once.");
  });

  test("renders message actions outside content and timestamps only at speaker group boundaries", () => {
    const html = renderToString(
      <TestChatTranscript
        blocks={[
          userMessageBlock({
            id: "block_user_1",
            runId: "run_api",
            ordinal: 1,
            text: "First prompt",
          }),
          userMessageBlock({
            id: "block_user_2",
            runId: "run_api",
            ordinal: 2,
            text: "Second prompt",
          }),
          assistantTextBlock({
            id: "block_assistant_1",
            runId: "run_api",
            ordinal: 3,
            status: "complete",
            text: "First answer",
          }),
          assistantTextBlock({
            id: "block_assistant_2",
            runId: "run_api",
            ordinal: 4,
            status: "complete",
            text: "Second answer",
          }),
          userMessageBlock({
            id: "block_user_3",
            runId: "run_api",
            ordinal: 5,
            text: "Third prompt",
          }),
        ]}
      />,
    );

    expect(rowCount(html, "chat-message-timestamp")).toBe(3);
    expect(rowCount(html, "chat-message-actions")).toBe(5);
    expect(html).toContain('aria-label="Copy message"');
    expect(html).toContain('aria-label="Retry message by forking conversation"');
    expect(htmlScopeForTestId(html, "chat-user-message-content")).not.toContain(
      'aria-label="Copy message"',
    );
    expect(htmlScopeForTestId(html, "chat-assistant-message-content")).not.toContain(
      'aria-label="Retry message by forking conversation"',
    );
  });

  test("orders runs by appearance and keeps queued messages at the tail", () => {
    const html = renderToString(
      <TestChatTranscript
        blocks={[
          userMessageBlock({
            id: "block_active_user",
            runId: "run_active",
            ordinal: 1,
            text: "Active prompt",
          }),
          assistantTextBlock({
            id: "block_active_assistant",
            runId: "run_active",
            ordinal: 2,
            status: "complete",
            text: "Active answer",
          }),
          userMessageBlock({
            id: "block_steer_user",
            runId: "run_steer",
            ordinal: 1,
            text: "Steering prompt",
          }),
          assistantTextBlock({
            id: "block_steer_assistant",
            runId: "run_steer",
            ordinal: 2,
            status: "complete",
            text: "Steering answer",
          }),
        ]}
        queuedMessages={[queuedChatMessage("message_queued", "run_queue", "Queued prompt")]}
      />,
    );

    expectTextOrder(html, [
      "Active prompt",
      "Active answer",
      "Steering prompt",
      "Steering answer",
      "Queued prompt",
    ]);
  });

  test("renders load more for paged run output", () => {
    const html = renderToString(
      <TestChatTranscript
        focusedSourceRunItemId="item_command"
        blocks={[
          activityBlock({
            id: "block_command",
            runId: "run_api",
            ordinal: 1,
            sourceRunItemId: "item_command",
            activityStatus: "completed",
            hasDetails: true,
            hasOutput: true,
            details: activityDetails({ command: "go test ./...", cwd: "/tmp/workspace" }),
          }),
          assistantTextBlock({
            id: "block_assistant",
            runId: "run_api",
            ordinal: 2,
            status: "complete",
            text: "done",
          }),
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
      />,
    );

    expect(html).toContain("Load more");
  });

  test("renders tool messages as styled raw output", () => {
    const html = renderToString(
      <TestChatTranscript
        blocks={[
          userMessageBlock({
            id: "block_tool",
            runId: "run_api",
            ordinal: 1,
            role: "tool",
            text: '{"tool":"style_probe","ok":true,"rows":17}',
          }),
        ]}
      />,
    );
    const scope = htmlScopeForTestId(html, "chat-tool-message-content");

    expect(scope).toContain("border-accent-cyan/40");
    expect(scope).toContain("font-mono");
    expect(scope).toContain("<pre");
    expect(scope).toContain("&quot;style_probe&quot;");
  });

  test("renders pending approval controls", () => {
    const html = renderToString(<TestChatTranscript activeRun={approvalRun()} blocks={[]} />);

    expect(html).toContain("Which branch should Codex use?");
    expect(html).toContain("main");
    expect(html).toContain("release");
    expect(html).toContain("Answer");
    expect(html).toContain("Cancel");
  });

  test("renders approval-blocked live status without the normal working indicator", () => {
    const activeRun = approvalRun();
    const html = renderToString(
      <TestChatTranscript
        activeRun={activeRun}
        activeRunLiveness={runLivenessFixture(activeRun, "attached")}
        blocks={[
          runStatusBlock({
            id: "block_working",
            runId: activeRun.id,
            ordinal: 1,
            status: "streaming",
            mode: "working",
            label: "Working",
          }),
        ]}
      />,
    );

    expect(html).toContain('data-run-status-mode="approval"');
    expect(html).toContain("Awaiting approval");
    expect(html).not.toContain('data-live-headline="active"');
  });
});

interface TestChatTranscriptOptions {
  activeRun?: Run | null;
  activeRunLiveness?: ChatTranscriptProps["activeRunLiveness"];
  blocks?: TranscriptBlock[];
  editQueuedMessage?: ChatTranscriptProps["editQueuedMessage"];
  editingQueuedMessageId?: string | null;
  focusedSourceRunItemId?: string | null;
  messages?: ChatMessage[];
  operation?: string | null;
  queuedMessages?: ChatMessage[];
  removeQueuedMessage?: ChatTranscriptProps["removeQueuedMessage"];
  removingQueuedMessageId?: string | null;
  runItemOutputPagesByRunItemId?: ChatTranscriptProps["runItemOutputPagesByRunItemId"];
  runItemOutputs?: RunItemOutput[];
  sendSteeringImmediately?: ChatTranscriptProps["sendSteeringImmediately"];
}

const noop = async () => {};

function chatTranscriptOutputMaps(outputs: RunItemOutput[]) {
  const runItemOutputsById: Record<string, RunItemOutput> = {};
  const runItemOutputIdsByRunItemId: Record<string, string[]> = {};
  for (const output of outputs) {
    runItemOutputsById[output.id] = output;
    runItemOutputIdsByRunItemId[output.runItemId] = [
      ...(runItemOutputIdsByRunItemId[output.runItemId] ?? []),
      output.id,
    ];
  }
  return { runItemOutputIdsByRunItemId, runItemOutputsById };
}

function TestChatTranscript(options: TestChatTranscriptOptions) {
  const resolved = {
    activeRun: null,
    activeRunLiveness: null,
    blocks: [],
    editQueuedMessage: noop,
    editingQueuedMessageId: null,
    focusedSourceRunItemId: null,
    messages: [],
    operation: null,
    queuedMessages: [],
    removeQueuedMessage: noop,
    removingQueuedMessageId: null,
    runItemOutputPagesByRunItemId: {},
    runItemOutputs: [] as RunItemOutput[],
    sendSteeringImmediately: noop,
    ...options,
  };
  const outputMaps = chatTranscriptOutputMaps(resolved.runItemOutputs);
  return (
    <ChatTranscript
      activeRun={resolved.activeRun}
      activeRunLiveness={resolved.activeRunLiveness}
      blocks={resolved.blocks}
      editQueuedMessage={resolved.editQueuedMessage}
      editingQueuedMessageId={resolved.editingQueuedMessageId}
      focusedSourceRunItemId={resolved.focusedSourceRunItemId}
      hasMoreOlder={false}
      loadOlder={noop}
      loadRunItemOutput={noop}
      messages={resolved.messages}
      operation={resolved.operation}
      queuedMessages={resolved.queuedMessages}
      removeQueuedMessage={resolved.removeQueuedMessage}
      removingQueuedMessageId={resolved.removingQueuedMessageId}
      runItemOutputIdsByRunItemId={outputMaps.runItemOutputIdsByRunItemId}
      runItemOutputPagesByRunItemId={resolved.runItemOutputPagesByRunItemId}
      runItemOutputsById={outputMaps.runItemOutputsById}
      sendSteeringImmediately={resolved.sendSteeringImmediately}
      submitApproval={noop}
    />
  );
}

function runFixture(id: string, status: Run["status"]): Run {
  return {
    assistantMessageId: "",
    completedAt: "",
    conversationId: "conversation_api",
    error: "",
    harness: "codex",
    id,
    pendingApproval: null,
    promptSummary: "test",
    schemaVersion: 1,
    startedAt: "2026-05-29T20:00:00Z",
    status,
    triggerMessageId: `${id}_trigger`,
    workspaceId: "workspace_api",
  };
}

function runLivenessFixture(
  run: Run,
  status: RunLiveness["status"],
  values: Partial<RunLiveness> = {},
): RunLiveness {
  const phase = values.phase ?? runLivenessPhaseForStatus(status);
  return {
    activeStatus: runActiveStatusForPhase(phase),
    cancellable: status !== "terminal",
    conversationId: run.conversationId,
    error: "",
    harness: run.harness,
    lastProviderEventAt: "2026-05-29T20:00:00Z",
    lastVisibleActivityAt: "2026-05-29T20:00:00Z",
    lastReconciledAt: "",
    phase,
    providerThreadId: "thread_api",
    providerTurnId: "turn_api",
    reason:
      status === "attached"
        ? "provider_turn_linked"
        : status === "terminal"
          ? "run_terminal"
          : status === "lost"
            ? "provider_unavailable"
            : "wake_recheck",
    retryable: status === "reconciling" || status === "lost",
    runId: run.id,
    status,
    steerable: status === "attached",
    steeringDisabledReason: status === "attached" ? "" : "not_attached",
    workspaceId: run.workspaceId,
    ...values,
  };
}

function runLivenessPhaseForStatus(status: RunLiveness["status"]): RunLiveness["phase"] {
  switch (status) {
    case "attached":
      return "attached";
    case "reconciling":
      return "reconnecting";
    case "lost":
      return "lost";
    case "terminal":
      return "terminal";
    default:
      throw new Error(`Unsupported run liveness status: ${status}`);
  }
}

function runActiveStatusForPhase(phase: RunLiveness["phase"]): RunLiveness["activeStatus"] {
  switch (phase) {
    case "attached":
      return { detail: "", headline: "Working", headlineSource: "fallback", kind: "working" };
    case "blocked":
      return {
        detail: "",
        headline: "Approval required",
        headlineSource: "approval",
        kind: "blocked",
      };
    case "lost":
      return {
        detail: "",
        headline: "Connection lost",
        headlineSource: "liveness",
        kind: "connection_lost",
      };
    case "terminal":
      return { detail: "", headline: "Finished", headlineSource: "terminal", kind: "finished" };
    case "starting":
      return { detail: "", headline: "Starting", headlineSource: "liveness", kind: "starting" };
    case "waiting_for_provider":
      return {
        detail: "",
        headline: "Waiting for provider",
        headlineSource: "liveness",
        kind: "waiting_for_provider",
      };
    case "stalled":
      return {
        detail: "",
        headline: "Provider stalled",
        headlineSource: "liveness",
        kind: "stalled",
      };
    case "reconnecting":
      return {
        detail: "",
        headline: "Reconnecting",
        headlineSource: "liveness",
        kind: "reconnecting",
      };
    default:
      throw new Error(`Unsupported run liveness phase: ${phase}`);
  }
}

function approvalRun(): Run {
  return {
    ...runFixture("run_api", "running"),
    pendingApproval: {
      approved: false,
      body: "Codex wants permission",
      command: "go test ./...",
      createdAt: "2026-05-29T20:00:00Z",
      filePath: "",
      id: "approval_api",
      kind: "user_input",
      options: [],
      permission: "",
      providerItemId: "",
      question: "",
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
    error?: string | null;
    loading?: boolean;
    topicStatus?: NavigatorItem["conversation"]["status"];
  } = {},
) {
  useChatStore.setState((current) => ({
    conversationListsByWorkspaceId: {
      ...current.conversationListsByWorkspaceId,
      [workspaceId]: {
        conversations,
        corruption: emptyCorruption(),
        diagnostics: [],
        error: options.error ?? null,
        loading: options.loading ?? false,
      },
    },
  }));
  const navigatorItems = conversations.map((item) =>
    topicNavigatorItemFromChat(item, options.topicStatus),
  );
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

function topicNavigatorItemFromChat(
  item: ConversationListItem,
  topicStatus: NavigatorItem["conversation"]["status"] = "idle",
): NavigatorItem {
  const conversation = item.conversation;
  return {
    branch: null,
    conversation: {
      archivedAt: null,
      createdAt: conversation.createdAt,
      id: conversation.id,
      lastTrajectorySequence: 0,
      status: topicStatus,
      title: conversation.title,
      topicDescriptor: "",
      updatedAt: conversation.updatedAt,
      workspaceId: conversation.workspaceId,
    },
    presentationProfile: {
      conversationId: conversation.id,
      narratorSpeechEnabled: true,
      narratorVoiceReuse: null,
      narratorVoiceSelection: "auto_distinct",
      paletteReuse: null,
      paletteSelection: "auto_distinct",
      requestedNarratorVoiceId: null,
      requestedPaletteId: null,
      resolvedNarratorVoiceId: "alloy",
      resolvedPaletteId: "sky",
      updatedAt: conversation.updatedAt,
    },
  };
}

function conversationListItem(
  id: string,
  title: string,
  workspaceId = "workspace_web",
): ConversationListItem {
  return {
    activeRunId: "",
    activeRunLiveness: null,
    pinnedAt: "",
    conversation: {
      archivedAt: "",
      codexEffectiveSettings: null,
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

function emptyCorruption() {
  return {
    byKind: [],
    bySeverity: [],
    hasCorruption: false,
    total: 0,
  };
}
