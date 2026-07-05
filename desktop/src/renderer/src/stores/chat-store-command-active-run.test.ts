import type {
  ChatCommandResult,
  ChatGoalState,
  ChatMessage,
  Conversation,
  MessagePage,
  RunLiveness,
  TranscriptBlock,
  TranscriptBlockStatus,
} from "@generated/backend";
import type { SettaAPI } from "@shared/types";
import { beforeEach, expect, test, vi } from "vitest";

import { assistantTextBlock, userMessageBlock } from "./chat-store-events.test.helpers";
import { useChatStore } from "./chat-store";
import { message, testRun } from "./chat-store.test.fixtures";

beforeEach(() => {
  useChatStore.setState(useChatStore.getInitialState(), true);
});

test("execute command keeps returned active run when blocks arrive before response", async () => {
  const conversation = testConversation();
  const activeRun = testRun("running", "run_goal");
  const activeRunLiveness: RunLiveness = {
    activeStatus: {
      detail: "",
      headline: "Working",
      headlineSource: "fallback",
      kind: "working",
    },
    cancellable: true,
    conversationId: conversation.id,
    error: "",
    harness: "codex",
    lastProviderEventAt: "2026-05-29T20:00:01Z",
    lastVisibleActivityAt: "2026-05-29T20:00:01Z",
    lastReconciledAt: "",
    phase: "attached",
    providerThreadId: "thread_fake",
    providerTurnId: "turn_goal",
    reason: "provider_turn_linked",
    retryable: false,
    runId: activeRun.id,
    status: "attached",
    steerable: true,
    steeringDisabledReason: "",
    workspaceId: conversation.workspaceId,
  };
  const blocks = runBlocks(activeRun.id, { assistantText: "working" });
  const commandMessage = message(
    "message_command",
    1,
    "command",
    "complete",
    "Goal set: tests",
    "normal",
    "",
  );
  const commandResponse = deferred<Awaited<ReturnType<SettaAPI["chat"]["executeCommand"]>>>();
  installSettaAPI({
    executeCommand: vi.fn().mockReturnValue(commandResponse.promise),
  });
  useChatStore.setState({
    selectedConversation: conversation,
    status: "ready",
    workspaceId: conversation.workspaceId,
  });

  const commandPromise = useChatStore.getState().executeCommand("/goal tests");
  useChatStore.setState(blockState(blocks));
  commandResponse.resolve({
    activeRun,
    activeRunLiveness,
    conversation,
    message: commandMessage,
    page: testPage(conversation, [commandMessage], goalState("tests", "active"), blocks),
    result: goalCommandResult(),
  });
  await commandPromise;

  expect(useChatStore.getState().activeRun?.id).toBe(activeRun.id);
  expect(useChatStore.getState().activeRunLiveness?.runId).toBe(activeRun.id);
});

function installSettaAPI(chat: Pick<SettaAPI["chat"], "executeCommand">) {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { setta: { chat } as unknown as SettaAPI },
  });
}

function testConversation(): Conversation {
  return {
    archivedAt: "",
    codexEffectiveSettings: null,
    codexSettings: null,
    createdAt: "2026-05-29T20:00:00Z",
    harnessRefs: [],
    id: "conversation_api",
    internal: false,
    schemaVersion: 1,
    title: "API chat",
    updatedAt: "2026-05-29T20:00:00Z",
    workflow: null,
    easyRun: null,
    workspaceId: "workspace_api",
  };
}

function testPage(
  conversation: Conversation,
  messages: ChatMessage[],
  goal: ChatGoalState,
  blocks: TranscriptBlock[],
): MessagePage {
  return {
    blocks,
    conversation,
    goal,
    hasMoreOlder: false,
    messages,
    olderBeforeBlockOrdinal: 0,
    queue: { messages: [], runs: [] },
  };
}

function goalState(objective: string, status: string): ChatGoalState {
  return {
    createdAt: 0,
    objective,
    status,
    threadId: "thread_fake",
    timeUsedSeconds: 0,
    tokenBudget: null,
    tokensUsed: 0,
    updatedAt: 0,
  };
}

function goalCommandResult(): ChatCommandResult {
  return {
    action: "display",
    composerDraft: "",
    currentPermission: null,
    goal: goalState("tests", "active"),
    kind: "goal",
    message: "Goal set: tests",
    models: [],
    permissionPresets: [],
    raw: "/goal tests",
    reasoningEfforts: [],
    selectedModel: "",
    selectedPermissionPreset: null,
    selectedReasoningEffort: null,
    title: "Goal",
  };
}

function runBlocks(
  runId: string,
  opts: { assistantText: string; assistantStatus?: TranscriptBlockStatus },
): TranscriptBlock[] {
  return [
    userMessageBlock({ id: `${runId}_trigger`, ordinal: 1, runId, text: "user" }),
    assistantTextBlock({
      id: `${runId}_text`,
      ordinal: 2,
      runId,
      status: opts.assistantStatus ?? "streaming",
      text: opts.assistantText,
    }),
  ];
}

function blockState(blocks: TranscriptBlock[]) {
  return {
    transcriptBlocks: blocks,
    transcriptBlocksById: Object.fromEntries(blocks.map((block) => [block.id, block])),
  };
}

interface Deferred<T> {
  promise: Promise<T>;
  reject: (error: Error) => void;
  resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
}
