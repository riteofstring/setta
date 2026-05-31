import type { ChatMessage, Run, RunItem, RunItemOutput, TranscriptTurn } from "@generated/backend";
import { renderToString } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { WorkspacePanel } from "./App";
import { ChatTranscript, type ChatTranscriptProps } from "./components/chat-transcript";
import { WorkspaceSidebar } from "./components/workspace-sidebar";

describe("workspace renderer states", () => {
  test("renders the empty workspace state", () => {
    const html = renderToString(
      <>
        <WorkspaceSidebar
          activeWorkspaces={[]}
          busy={false}
          closeWorkspace={async () => {}}
          openLocalFolder={async () => {}}
          recentWorkspaces={[]}
          removeRecent={async () => {}}
          reorderWorkspaces={async () => {}}
          selectWorkspace={async () => {}}
          selectedWorkspaceId=""
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
    expect(html).toContain("No active workspaces");
    expect(html).toContain("No recent workspaces");
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
          activeWorkspaces={[api, web]}
          busy={false}
          closeWorkspace={async () => {}}
          openLocalFolder={async () => {}}
          recentWorkspaces={[web, api]}
          removeRecent={async () => {}}
          reorderWorkspaces={async () => {}}
          selectWorkspace={async () => {}}
          selectedWorkspaceId="workspace_web"
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
    expect(html).toContain('data-testid="recent-workspace-list"');
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
        activeWorkspaces={workspaces}
        busy={false}
        closeWorkspace={async () => {}}
        openLocalFolder={async () => {}}
        recentWorkspaces={workspaces}
        removeRecent={async () => {}}
        reorderWorkspaces={async () => {}}
        selectWorkspace={async () => {}}
        selectedWorkspaceId="workspace_0"
      />,
    );

    expect(rowCount(html, "active-workspace-item")).toBeLessThan(30);
    expect(rowCount(html, "recent-workspace-item")).toBeLessThan(30);
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
> & {
  messages?: ChatMessage[];
  runItemOutputPagesByRunItemId?: ChatTranscriptProps["runItemOutputPagesByRunItemId"];
  runItemOutputs?: RunItemOutput[];
  runItems?: RunItem[];
  transcript?: TranscriptTurn[];
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
