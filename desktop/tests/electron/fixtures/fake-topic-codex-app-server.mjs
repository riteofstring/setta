import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import process from "node:process";
import readline from "node:readline";
import { setImmediate, setTimeout } from "node:timers";
import {
  artifactPolicyScenarioForText,
  threadHasArtifactTool,
} from "./fake-topic-artifact-tool.mjs";
import { artifactToolResponseAction } from "./fake-topic-artifact-turns.mjs";
import {
  emitSimultaneousAudioHoldProgress,
  listCursorOffset,
  listLimit,
  optionalNonNegativeIntegerEnvironment,
  scriptedMasterClarificationConfirmationDecision,
  scriptedMasterFocusDecision,
  scriptedMasterFolderlessClarificationDecision,
  scriptedMasterFolderlessRecentFocusDecision,
  validSideBoundary,
  validSideContextFrame,
  validStructuredMasterRouteContext,
} from "./fake-topic-codex-app-server-helpers.mjs";
import { createExactStructuredInputRoutes } from "./fake-topic-codex-input-routes.mjs";
import * as restrictedThread from "./fake-topic-codex-restricted-thread.mjs";
const persistedStatePath = process.env.SETTA_E2E_TOPIC_CODEX_STATE_PATH ?? "";
const initialThreadStartDelayMs = optionalNonNegativeIntegerEnvironment(
  "SETTA_E2E_TOPIC_CODEX_INITIAL_THREAD_START_DELAY_MS",
);
const persistedState = readPersistedState();
let threadCounter = persistedState.threadCounter;
let turnCounter = persistedState.turnCounter;
let approvalCounter = persistedState.approvalCounter;
let crashCounter = persistedState.crashCounter;
let toolCallCounter = persistedState.toolCallCounter;
let processGeneration = persistedState.processGeneration + 1;
let methodSequence = persistedState.methodLog.reduce(
  (max, entry) => Math.max(max, entry.sequence ?? 0),
  0,
);
const methodLog = [...persistedState.methodLog];
const durableThreads = new Map(persistedState.threads.map((thread) => [thread.id, thread]));
const loadedThreads = new Map();
const turns = new Map(persistedState.turns.map((turn) => [turn.id, turn]));
const heldTurns = new Map();
const pendingApprovals = new Map();
const pendingToolCalls = new Map();
const crashAfterCompletedTurns = new Set();
const failedDirectorInputs = new Set();
const simultaneousCompletionInput = "complete simultaneous audio now";
const pendingSimultaneousCompletions = [];
const heldStructuredKeys = new Set(persistedState.heldStructuredKeys);
const heldTurnStartKeys = new Set(persistedState.heldTurnStartKeys);
let account = null;
persistState();
const methodHandlers = new Map([
  ["account/login/start", startAccountLogin],
  ["account/logout", logoutAccount],
  ["account/read", readAccount],
  ["config/read", readConfig],
  ["initialize", initialize],
  ["initialized", () => {}],
  ["model/list", listModels],
  ["thread/fork", forkThread],
  ["thread/inject_items", injectThreadItems],
  ["thread/start", startThread],
  ["thread/resume", resumeThread],
  ["thread/read", readThread],
  ["thread/list", listThreads],
  ["thread/unsubscribe", unsubscribeThread],
  ["thread/backgroundTerminals/terminate", terminateBackgroundTerminals],
  ["turn/start", startTurn],
  ["turn/steer", steerTurn],
  ["turn/interrupt", interruptTurn],
]);
const input = readline.createInterface({ input: process.stdin });
input.on("line", (line) => {
  if (line.trim() === "") {
    return;
  }
  const message = JSON.parse(line);
  if (message.method === undefined) {
    handleClientResponse(message);
    return;
  }
  handleMethod(message);
});
function handleMethod(message) {
  const handler = methodHandlers.get(message.method);
  if (!handler) {
    respondError(message.id, -32601, `unsupported fake topic method ${message.method}`);
    return;
  }
  handler(message);
}
function initialize(message) {
  respond(message.id, {
    codexHome: "/tmp/setta-topic-codex",
    platformFamily: "unix",
    platformOs: "test",
    userAgent: "setta-topic-codex-fake",
  });
}
function readAccount(message) {
  respond(message.id, { account, requiresOpenaiAuth: true });
}
function startAccountLogin(message) {
  if (message.params?.type !== "chatgpt") {
    respondError(message.id, -32602, "fake topic account login requires ChatGPT");
    return;
  }
  respond(message.id, {
    authUrl: "https://chatgpt.com/auth/fake-topic",
    loginId: "login_topic_fake",
    type: "chatgpt",
  });
  setTimeout(() => {
    account = { email: "user@example.com", planType: "pro", type: "chatgpt" };
    notify("account/login/completed", {
      error: null,
      loginId: "login_topic_fake",
      success: true,
    });
    notify("account/updated", { authMode: "chatgpt", planType: "pro" });
  }, 25);
}
function logoutAccount(message) {
  account = null;
  respond(message.id, {});
  notify("account/updated", { authMode: null, planType: null });
}
function listModels(message) {
  respond(message.id, {
    data: [
      fakeModel("gpt-5.6-sol", "high", true),
      fakeModel("gpt-5.6-terra", "medium", false),
      fakeModel("gpt-5.6-luna", "medium", false),
      fakeModel("gpt-5.4-mini", "low", false),
    ],
    nextCursor: null,
  });
}
function readConfig(message) {
  respond(message.id, {
    config: {
      mcp_servers: {
        "configured-topic-server": { command: "must-not-run" },
      },
    },
    origins: {},
  });
}
function unsubscribeThread(message) {
  const threadId = requiredString(message.params ?? {}, "threadId");
  recordProviderMethod("thread/unsubscribe", message.params ?? {}, { threadId });
  const status = loadedThreads.delete(threadId) ? "unsubscribed" : "notLoaded";
  persistState();
  respond(message.id, { status });
}
function terminateBackgroundTerminals(message) {
  respond(message.id, { terminated: true });
}
function startThread(message) {
  const params = message.params ?? {};
  const restricted = params.allowProviderModelFallback === false;
  if (restricted) {
    restrictedThread.assertRestrictedThreadParams(params, true);
  }
  const delayInitialResponse = threadCounter === 0 && initialThreadStartDelayMs > 0;
  threadCounter += 1;
  const threadId = `topic-thread-${threadCounter}`;
  const state = startThreadState(params, threadId, restricted);
  loadedThreads.set(threadId, state);
  recordProviderMethod("thread/start", params, { threadId });
  persistState();
  const sendResponse = () =>
    respond(message.id, threadOperationResponse(fakeThread(threadId), state));
  if (delayInitialResponse) {
    setTimeout(sendResponse, initialThreadStartDelayMs);
    return;
  }
  sendResponse();
}
function startThreadState(params, threadId, restricted) {
  return {
    approvalPolicy: params.approvalPolicy ?? null,
    cwd: requiredString(params, "cwd"),
    developerInstructions: params.developerInstructions ?? null,
    dynamicTools: params.dynamicTools ?? [],
    ephemeral: params.ephemeral === true,
    id: threadId,
    model: params.model ?? "gpt-5.6-sol",
    reasoningEffort: params.config?.model_reasoning_effort ?? null,
    restricted,
    runtimeWorkspaceRoots: params.runtimeWorkspaceRoots ?? [],
    sandbox: params.sandbox ?? null,
    serviceTier: startThreadServiceTier(params, restricted),
    turnIds: [],
  };
}
function startThreadServiceTier(params, restricted) {
  if (restricted && params.serviceTier === null) return "default";
  return params.serviceTier ?? null;
}
function forkThread(message) {
  const params = message.params ?? {};
  const parentThreadId = requiredString(params, "threadId");
  recordProviderMethod("thread/fork", params, { threadId: parentThreadId });
  const parent = loadedThreads.get(parentThreadId);
  if (!parent) {
    respondThreadNotFound(message.id, "thread/fork", parentThreadId);
    return;
  }
  const ephemeral = params.ephemeral === true;
  const sourceTurnIds = forkSourceTurns(message, parent, ephemeral);
  if (!sourceTurnIds) return;
  threadCounter += 1;
  const threadId = `topic-thread-${threadCounter}`;
  const state = forkThreadState(params, parent, parentThreadId, threadId, ephemeral, sourceTurnIds);
  loadedThreads.set(threadId, state);
  if (!ephemeral) {
    materializeDurableThread(state);
  } else {
    persistState();
  }
  const thread = fakeThread(threadId);
  thread.turns = state.turnIds.map((turnId) => turns.get(turnId));
  respond(message.id, threadOperationResponse(thread, state));
}
function forkSourceTurns(message, parent, ephemeral) {
  if (ephemeral) return ephemeralSideSourceTurns(message, parent);
  return durableForkSourceTurns(message, parent);
}
function forkThreadState(params, parent, parentThreadId, threadId, ephemeral, sourceTurnIds) {
  const config = params.config ?? {};
  return {
    approvalPolicy: params.approvalPolicy ?? null,
    cwd: requiredString(params, "cwd"),
    developerInstructions: params.developerInstructions ?? null,
    dynamicTools: parent.dynamicTools ?? [],
    ephemeral,
    forkedFromId: parentThreadId,
    id: threadId,
    model: params.model ?? parent.model,
    reasoningEffort: config.model_reasoning_effort ?? null,
    sandbox: params.sandbox ?? null,
    serviceTier: params.serviceTier ?? null,
    turnIds: sourceTurnIds,
  };
}

function durableForkSourceTurns(message, parent) {
  const lastTurnId = requiredString(message.params, "lastTurnId");
  const sourceIndex = parent.turnIds.indexOf(lastTurnId);
  const sourceTurn = turns.get(lastTurnId);
  if (sourceIndex < 0 || sourceTurn?.status !== "completed") {
    respondError(message.id, -32602, `fork source ${lastTurnId} is not a completed parent turn`);
    return null;
  }
  return parent.turnIds.slice(0, sourceIndex + 1);
}

function ephemeralSideSourceTurns(message, parent) {
  const params = message.params ?? {};
  if (parent.turnIds.length === 0 || parent.noSideRollout === true) {
    respondError(message.id, -32602, `no rollout found for thread id ${parent.id}`);
    return null;
  }
  if (!validEphemeralSideSettings(params)) {
    respondError(message.id, -32602, "ephemeral side fork settings drifted");
    return null;
  }
  return [...parent.turnIds];
}

function validEphemeralSideSettings(params) {
  const config = params.config ?? {};
  const instructions = params.developerInstructions ?? "";
  return [
    !Object.hasOwn(params, "lastTurnId"),
    params.model === "gpt-5.6-luna",
    params.approvalPolicy === "never",
    params.sandbox === "read-only",
    params.serviceTier === null,
    config.model_reasoning_effort === "medium",
    instructions.includes("ephemeral side conversation"),
  ].every(Boolean);
}

function injectThreadItems(message) {
  const params = message.params ?? {};
  const threadId = requiredString(params, "threadId");
  recordProviderMethod("thread/inject_items", params, { threadId });
  if (injectTopicThreadInitialization(message)) {
    return;
  }
  if (injectRestrictedThreadInitialization(message)) {
    return;
  }
  const request = sideContextInjectionRequest(message);
  if (!request) return;
  const boundary = injectedMessageText(request.items[0], "user");
  const context = injectedMessageText(request.items[1], "developer");
  if (!validSideBoundary(boundary, context)) {
    respondError(message.id, -32602, "side boundary instructions drifted");
    return;
  }
  const frameStart = context.indexOf("{");
  if (frameStart < 0) {
    respondError(message.id, -32602, "side context frame JSON is missing");
    return;
  }
  const frame = JSON.parse(context.slice(frameStart));
  if (!validSideContextFrame(frame)) {
    respondError(message.id, -32602, "side in-flight context frame drifted");
    return;
  }
  request.thread.sideContextFrame = frame;
  persistState();
  respond(message.id, {});
}

function injectTopicThreadInitialization(message) {
  const params = message.params ?? {};
  const threadId = requiredString(params, "threadId");
  const thread = loadedThreads.get(threadId);
  if (!thread || thread.ephemeral || thread.restricted) {
    return false;
  }
  const items = params.items;
  if (
    !Array.isArray(items) ||
    items.length !== 1 ||
    !injectedMessageText(items[0], "user").includes(
      "Setta initialized this durable topic conversation thread",
    )
  ) {
    respondError(message.id, -32602, "topic thread initialization drifted");
    return true;
  }
  thread.materialized = true;
  materializeDurableThread(thread);
  respond(message.id, {});
  return true;
}

function injectRestrictedThreadInitialization(message) {
  const params = message.params ?? {};
  const threadId = requiredString(params, "threadId");
  const thread = loadedThreads.get(threadId);
  if (!thread?.restricted || thread.ephemeral) {
    return false;
  }
  const items = params.items;
  if (
    !Array.isArray(items) ||
    items.length !== 1 ||
    !injectedMessageText(items[0], "user").includes(
      "Setta initialized this restricted durable thread",
    )
  ) {
    respondError(message.id, -32602, "restricted thread initialization drifted");
    return true;
  }
  thread.materialized = true;
  materializeDurableThread(thread);
  respond(message.id, {});
  return true;
}

function sideContextInjectionRequest(message) {
  const params = message.params ?? {};
  const threadId = requiredString(params, "threadId");
  const thread = loadedThreads.get(threadId);
  if (!thread || thread.ephemeral !== true || !thread.forkedFromId) {
    respondThreadNotFound(message.id, "thread/inject_items", threadId);
    return;
  }
  const items = params.items;
  if (!Array.isArray(items) || items.length !== 2) {
    respondError(message.id, -32602, "side context injection requires boundary and frame items");
    return null;
  }
  return { items, thread };
}

function injectedMessageText(item, role) {
  if (!Array.isArray(item?.content)) return "";
  const [content] = item.content;
  const valid = [
    item.type === "message",
    item.role === role,
    item.content.length === 1,
    content?.type === "input_text",
    typeof content?.text === "string",
  ].every(Boolean);
  if (!valid) return "";
  return content.text;
}

function resumeThread(message) {
  const params = message.params ?? {};
  const threadId = requiredString(params, "threadId");
  recordProviderMethod("thread/resume", params, { threadId });
  if (params.excludeTurns !== true) {
    throw new Error("thread/resume must set excludeTurns: true");
  }
  const state = durableThreads.get(threadId);
  if (!state || state.ephemeral === true) {
    respondThreadNotFound(message.id, "thread/resume", threadId);
    return;
  }
  if (!validateRestrictedThreadResume(message.id, threadId, state, params)) return;
  restrictedThread.applyResumeParams(state, params);
  loadedThreads.set(threadId, state);
  persistState();
  respond(message.id, threadOperationResponse(fakeThread(threadId), state));
}

function validateRestrictedThreadResume(messageId, threadId, state, params) {
  if (!state.restricted) return true;
  if (!state.materialized) {
    respondThreadNotFound(messageId, "thread/resume", threadId);
    return false;
  }
  restrictedThread.assertRestrictedThreadParams(params, false);
  state.runtimeWorkspaceRoots = params.runtimeWorkspaceRoots ?? [];
  return true;
}

function readThread(message) {
  const threadId = requiredString(message.params, "threadId");
  recordProviderMethod("thread/read", message.params ?? {}, { threadId });
  const threadState = loadedThreads.get(threadId);
  if (!threadState) {
    if (durableThreads.has(threadId)) {
      respondError(message.id, -32600, `thread not loaded: ${threadId}`);
    } else {
      respondThreadNotFound(message.id, "thread/read", threadId);
    }
    return;
  }
  const thread = fakeThread(threadId);
  if (message.params?.includeTurns === true) {
    thread.turns = threadState.turnIds.map((turnId) => turns.get(turnId));
  }
  thread.status = thread.turns.some((turn) => turn?.status === "inProgress")
    ? { activeFlags: [], type: "active" }
    : { type: "idle" };
  respond(message.id, { thread });
}

function listThreads(message) {
  const params = message.params ?? {};
  recordProviderMethod("thread/list", params, {});
  const allThreads = [...durableThreads.values()].filter((thread) => thread.ephemeral !== true);
  const start = listCursorOffset(params.cursor);
  const limit = listLimit(params.limit);
  const page = allThreads.slice(start, start + limit);
  const nextOffset = start + page.length;
  respond(message.id, {
    backwardsCursor: null,
    data: page.map((thread) => fakeThread(thread.id)),
    nextCursor: nextOffset < allThreads.length ? String(nextOffset) : null,
  });
}

function startTurn(message) {
  const threadId = requiredString(message.params, "threadId");
  const text = turnInputText(message.params);
  recordProviderMethod("turn/start", message.params ?? {}, { inputText: text, threadId });
  const thread = loadedThreads.get(threadId);
  if (!thread) {
    respondThreadNotFound(message.id, "turn/start", threadId);
    return;
  }
  turnCounter += 1;
  const turnId = `topic-turn-${turnCounter}`;
  const turn = fakeTurn(turnId, "inProgress");
  turns.set(turnId, turn);
  thread.turnIds.push(turnId);
  if (text === "complete parent before side fork no rollout") thread.noSideRollout = true;
  if (text === "provider lifecycle crash idle turn") {
    crashAfterCompletedTurns.add(turnId);
  }
  if (!thread.ephemeral && !durableThreads.has(threadId)) {
    thread.materialized = true;
    materializeDurableThread(thread);
  }
  persistState();
  if (holdTurnStartOnce(text)) {
    return;
  }
  respond(message.id, { turn });
  setImmediate(() => {
    if (message.params?.outputSchema) {
      emitStructuredTurn(threadId, turnId, text, message.params.outputSchema);
      return;
    }
    emitTurnScenario(threadId, turnId, text);
  });
}

function holdTurnStartOnce(text) {
  const key = text === "crash before provider link" ? "agent:pre-provider-link" : null;
  if (key === null || heldTurnStartKeys.has(key)) {
    return false;
  }
  heldTurnStartKeys.add(key);
  persistState();
  return true;
}

function emitStructuredTurn(threadId, turnId, text, outputSchema) {
  const context = JSON.parse(text);
  if (holdStructuredTurnOnce(context)) {
    return;
  }
  if (emitKnownStructuredTurn(threadId, turnId, context, outputSchema)) {
    return;
  }
  completeTurn(threadId, turnId, "failed", `unsupported structured context ${context.kind}`);
}

function emitKnownStructuredTurn(threadId, turnId, context, outputSchema) {
  const emitter = structuredTurnEmitters[context.kind];
  return emitter ? emitter(threadId, turnId, context, outputSchema) : false;
}

const structuredTurnEmitters = {
  checkpoint: emitStructuredCheckpoint,
  director_decision: emitStructuredDirectorDecision,
  focus: emitStructuredFocus,
  input_route: emitStructuredInputRoute,
  master_route: emitStructuredMasterRoute,
  projection: emitStructuredProjection,
  status: emitStructuredStatus,
};

function emitStructuredDirectorDecision(threadId, turnId, context, outputSchema) {
  const decision = scriptedDirectorDecision(context, outputSchema);
  if (decision === null) {
    completeTurn(threadId, turnId, "failed", "director decision context or schema drifted");
    return true;
  }
  emitAgentMessage(threadId, turnId, JSON.stringify({ decision }));
  completeTurn(threadId, turnId, "completed");
  return true;
}

function scriptedDirectorDecision(context, outputSchema) {
  const text = context.intent?.text;
  const schema = JSON.stringify(outputSchema);
  const serialized = JSON.stringify(context);
  if (
    !Array.isArray(context.allowedDecisionKinds) ||
    serialized.includes('"rootPath"') ||
    !schema.includes('"decision"')
  ) {
    return null;
  }
  if (text === "Director repair malformed." && context.validationDiagnostic === null) {
    return { kind: "not_a_director_decision" };
  }
  if (text === "Director repair malformed.") {
    return context.validationDiagnostic && context.allowedDecisionKinds.includes("answer_directly")
      ? { kind: "answer_directly", text: "The malformed decision was repaired." }
      : null;
  }
  if (text === "Director create folderless.") {
    return context.allowedDecisionKinds.includes("create_workstream")
      ? {
          initialInput: "director folderless first work",
          kind: "create_workstream",
          origin: {
            kind: "root",
            root: { resourceScope: { kind: "folderless" } },
          },
          proposedTitle: "Director root",
        }
      : null;
  }
  if (text?.startsWith("local transcript for ")) {
    return context.allowedDecisionKinds.includes("answer_directly")
      ? { kind: "answer_directly", text: "The Director received the voice request." }
      : null;
  }
  const selected = context.workstreams?.find(
    (target) => target.workstreamId === context.selectedWorkstreamId,
  );
  if (text === "Director create child.") {
    return selected?.allowsChildWorkstream &&
      context.allowedDecisionKinds.includes("create_workstream")
      ? {
          initialInput: "director child work",
          kind: "create_workstream",
          origin: {
            child: { parentWorkstreamId: selected.workstreamId },
            kind: "child",
          },
          proposedTitle: "Director child",
        }
      : null;
  }
  const workDecisions = new Map([
    ["Director send hold.", ["send_to_workstream", "director hold"]],
    ["Director queue next.", ["queue_behind_run", "director queued"]],
    ["Director steer now.", ["steer_run", "finish director hold"]],
    ["Director send cancel hold.", ["send_to_workstream", "director hold cancel"]],
    ["Director request approval.", ["send_to_workstream", "director approval"]],
    ["Director fail.", ["send_to_workstream", "director fail"]],
    ["Director artifact.", ["send_to_workstream", "director artifact"]],
    ["Director graph burst.", ["send_to_workstream", "director graph burst"]],
    [
      "Director text burst.",
      ["send_to_workstream", "Profile exactly 2000 conversation events for pane 1."],
    ],
    ["Director sustained.", ["send_to_workstream", "director sustained profile"]],
  ]);
  const workDecision = workDecisions.get(text);
  if (workDecision) {
    const [kind, authoredInput] = workDecision;
    return selected?.allowedDecisionKinds?.includes(kind)
      ? { authoredInput, kind, workstreamId: selected.workstreamId }
      : null;
  }
  if (text === "Director recover.") {
    const failure = selected?.recoverableFailures?.[0];
    return selected?.allowedDecisionKinds?.includes("recover_path") &&
      nonEmptyString(failure?.failureEventId)
      ? {
          failureEventId: failure.failureEventId,
          kind: "recover_path",
          workstreamId: selected.workstreamId,
        }
      : null;
  }
  return null;
}

function emitStructuredStatus(threadId, turnId, context) {
  if (context.trigger !== "explicit_status_requested") {
    return false;
  }
  emitAgentMessage(
    threadId,
    turnId,
    JSON.stringify({
      kind: "status_reply",
      sourceThroughSequence: context.sourceThroughSequence,
      statusReply: structuredStatusReply(context),
    }),
  );
  completeTurn(threadId, turnId, "completed");
  return true;
}

function structuredStatusReply(context) {
  return context.authoritative?.conversation?.workspaceId === ""
    ? "I can answer questions here, and I will ask for a folder only when work needs files."
    : "The topic is still working and has not been steered or interrupted.";
}

function emitStructuredCheckpoint(threadId, turnId, context) {
  emitAgentMessage(
    threadId,
    turnId,
    JSON.stringify({
      coveredThroughSequence: context.requestedRange.end,
      historicalSummary: `Observed topic history through sequence ${context.requestedRange.end}.`,
    }),
  );
  completeTurn(threadId, turnId, "completed");
  return true;
}

function emitStructuredMasterRoute(threadId, turnId, context, outputSchema) {
  const input = context.input?.input;
  const serialized = JSON.stringify(context);
  const schema = JSON.stringify(outputSchema);
  const decision = scriptedMasterRouteDecision(context, schema);
  if (!validStructuredMasterRouteContext(context, serialized, schema) || decision === null) {
    completeTurn(threadId, turnId, "failed", "master route context or schema drifted");
    return true;
  }
  if (!validMasterEscalationInput(input)) {
    completeTurn(threadId, turnId, "failed", "master escalation linkage drifted");
    return true;
  }
  emitAgentMessage(threadId, turnId, JSON.stringify({ decision }));
  completeTurn(threadId, turnId, "completed");
  return true;
}

function nonEmptyString(value) {
  return typeof value === "string" && value !== "";
}

function validMasterEscalationInput(input) {
  if (input?.source !== "conversation_escalation") {
    return true;
  }
  return [
    input.text === "route unrelated request through global master",
    nonEmptyString(input.originatingConversationId),
  ].every(Boolean);
}

const scriptedMasterRouteDecisionByText = new Map([
  ["Cancel active master route.", scriptedMasterCancellationDecision],
  ["Crash master route.", scriptedMasterCrashDecision],
  ["Focus Alpha topic.", scriptedMasterFocusDecision],
  ["Create Gamma topic.", scriptedMasterCreateDecision],
  [
    "Open the recent conversation where I asked what folder I was in.",
    scriptedMasterFolderlessRecentFocusDecision,
  ],
  [
    "Clarify the recent folder question conversation.",
    scriptedMasterFolderlessClarificationDecision,
  ],
  ["Open an Alpha side.", scriptedMasterSideDecision],
  ["Fork Alpha topic.", scriptedMasterForkDecision],
]);

function scriptedMasterCancellationDecision(context, schema) {
  const valid = [
    context.allowedDecisionKinds.includes("answer_global"),
    schema.includes('"answer_global"'),
  ].every(Boolean);
  return valid
    ? { kind: "answer_global", text: "A cancelled master route must never commit this answer." }
    : null;
}

function scriptedMasterCrashDecision(context, schema) {
  const valid = [
    context.allowedDecisionKinds.includes("answer_global"),
    schema.includes('"answer_global"'),
  ].every(Boolean);
  return valid
    ? { kind: "answer_global", text: "The crashed master route recovered exactly once." }
    : null;
}
function scriptedMasterRouteDecision(context, schema) {
  const input = context.input?.input;
  const scriptedDecision = scriptedMasterRouteDecisionByText.get(input?.text);
  if (scriptedDecision) {
    return scriptedDecision(context, schema, input);
  }
  const clarificationDecision = scriptedMasterClarificationConfirmationDecision(
    context,
    schema,
    input,
  );
  if (clarificationDecision) {
    return clarificationDecision;
  }
  if (masterInputNeedsClarification(input)) {
    return scriptedMasterClarificationDecision(context, schema);
  }
  if (isShellVoiceMasterInput(input)) {
    return scriptedMasterVoiceDecision(context, schema);
  }
  return null;
}

function scriptedMasterCreateDecision(context, schema) {
  const valid = [
    context.allowedDecisionKinds.includes("create_conversation"),
    schema.includes('"resourceScope"'),
    schema.includes('"folderless"'),
  ].every(Boolean);
  return valid
    ? {
        initialInput: "Start the Gamma topic from the global master.",
        kind: "create_conversation",
        proposedTitle: "Gamma topic",
        resourceScope: { kind: "folderless" },
      }
    : null;
}

function scriptedMasterSideDecision(context, schema) {
  const target = masterTargetByTitle(context, "Alpha topic");
  const valid = [
    target?.allowedDecisionKinds?.includes("create_side_conversation"),
    schema.includes(`"${target?.conversationId}"`),
  ].every(Boolean);
  return valid
    ? {
        input: "Answer this short Alpha tangent.",
        kind: "create_side_conversation",
        parentConversationId: target.conversationId,
      }
    : null;
}

function scriptedMasterForkDecision(context, schema) {
  const target = masterTargetByTitle(context, "Alpha topic");
  const forkPoint = target?.completedForkPoints?.at(-1);
  const valid = [
    target?.allowedDecisionKinds?.includes("fork_conversation"),
    nonEmptyString(forkPoint?.turnId),
    schema.includes(`"${target?.conversationId}"`),
    schema.includes(`"${forkPoint?.turnId}"`),
  ].every(Boolean);
  return valid
    ? {
        forkedAtTurnId: forkPoint.turnId,
        input: "Continue this Alpha work as a durable master fork.",
        kind: "fork_conversation",
        parentConversationId: target.conversationId,
      }
    : null;
}

function masterTargetByTitle(context, title) {
  return context.conversationTargets?.find((target) => target.title === title);
}

function masterInputNeedsClarification(input) {
  return input?.text === "Clarify Alpha." || input?.source === "conversation_escalation";
}
function isShellVoiceMasterInput(input) {
  return (
    input?.source === "shell" &&
    (input?.modality === "voice" || input?.text === "Answer from folderless master.")
  );
}

function scriptedMasterClarificationDecision(context, schema) {
  const valid = [
    context.allowedDecisionKinds.includes("clarify"),
    schema.includes('"clarify"'),
  ].every(Boolean);
  return valid
    ? { kind: "clarify", question: "Which topic should handle this unrelated request?" }
    : null;
}

function scriptedMasterVoiceDecision(context, schema) {
  const valid = [
    context.allowedDecisionKinds.includes("answer_global"),
    schema.includes('"answer_global"'),
  ].every(Boolean);
  return valid ? { kind: "answer_global", text: "The shell voice request was received." } : null;
}

function emitStructuredInputRoute(threadId, turnId, context) {
  const input = context.input?.input;
  const authoredInput = context.input?.clarificationReply?.text ?? input?.text;
  const serialized = JSON.stringify(context);
  const allowed = context.allowedDecisionKinds;
  const routeKind = structuredInputRouteKind(context, allowed);
  const valid = [
    Array.isArray(allowed),
    validStructuredRouteInput(context, input, routeKind),
    validStructuredRouteHistory(context, routeKind),
    structuredRouteContextIsRedacted(serialized),
  ].every(Boolean);
  if (!valid) {
    completeTurn(threadId, turnId, "failed", "input router context drifted");
    return true;
  }
  const decision = structuredInputRouteDecision(context, routeKind, authoredInput);
  emitAgentMessage(
    threadId,
    turnId,
    JSON.stringify({
      decision,
    }),
  );
  completeTurn(threadId, turnId, "completed");
  return true;
}

function structuredInputRouteDecision(context, routeKind, authoredInput) {
  const decision = {
    authoredInput: null,
    forkedAtTurnId: null,
    kind: routeKind,
    proposedTitle: null,
    question: null,
  };
  switch (routeKind) {
    case "answer_as_narrator":
      decision.question = authoredInput;
      return decision;
    case "clarify":
      decision.question = "Which exact pane request should I send?";
      return decision;
    case "fork_conversation": {
      const forkPoint = context.validCompletedForkPoints.at(-1);
      decision.authoredInput = authoredInput;
      decision.forkedAtTurnId = forkPoint.turnId;
      decision.proposedTitle = authoredInput;
      return decision;
    }
    default:
      decision.authoredInput = authoredInput;
      return decision;
  }
}

function structuredInputRouteKind(context, allowed) {
  if (!Array.isArray(allowed)) {
    return null;
  }
  const specialRoute = specialStructuredInputRouteKind(context, allowed);
  if (specialRoute) {
    return specialRoute;
  }
  return conversationStatusRouteKind(context, allowed);
}

function specialStructuredInputRouteKind(context, allowed) {
  if (isMasterEscalationRoute(context, allowed)) {
    return "escalate_to_master";
  }
  const clarification = structuredInputClarificationRouteKind(context, allowed);
  if (clarification) {
    return clarification;
  }
  const text = structuredInputRouteText(context);
  for (const route of exactStructuredInputRoutes) {
    if (route.inputs.has(text) && allowed.includes(route.kind)) {
      return route.kind;
    }
  }
  return null;
}

function structuredInputRouteText(context) {
  const input = context.input ?? {};
  return input.clarificationReply?.text ?? input.input?.text;
}

function structuredInputClarificationRouteKind(context, allowed) {
  return context.input?.input?.text === "clarify pane request" &&
    !context.input?.clarificationReply &&
    allowed.includes("clarify")
    ? "clarify"
    : null;
}

const exactStructuredInputRoutes = createExactStructuredInputRoutes({
  simultaneousCompletionInput,
});

function conversationStatusRouteKind(context, allowed) {
  const status = context.authoritative?.conversation?.status;
  if (status === "idle") {
    return allowed.includes("send_to_parent") ? "send_to_parent" : null;
  }
  if (!["working", "waiting_for_approval"].includes(status)) {
    return null;
  }
  return activeStructuredInputRouteKind(context, allowed);
}

function isMasterEscalationRoute(context, allowed) {
  return (
    context.input?.input?.text === "route unrelated request through global master" &&
    allowed.includes("escalate_to_master")
  );
}

function activeStructuredInputRouteKind(context, allowed) {
  if (context.authoritative?.currentInstructions?.turnStatus !== "running") {
    return null;
  }
  return allowed.includes("queue_parent_turn") ? "queue_parent_turn" : null;
}

function validStructuredRouteInput(context, input, routeKind) {
  return (
    typeof input?.text === "string" &&
    ["text", "voice"].includes(input.modality) &&
    validStructuredRouteInputSource(context, input) &&
    routeKind !== null
  );
}

function validStructuredRouteInputSource(context, input) {
  if (input?.hasSourcePane === true) {
    return true;
  }
  return input?.hasSourcePane === false && context.authoritative?.conversation?.workspaceId === "";
}

function validStructuredRouteHistory(context, routeKind) {
  if (routeKind !== "queue_parent_turn") {
    return true;
  }
  return context.priorRouteDecisions?.length >= 1 && context.trajectory?.length > 0;
}

function structuredRouteContextIsRedacted(serialized) {
  return (
    !serialized.includes("topic-thread-") &&
    !serialized.includes('"providerItemId":"provider-') &&
    !serialized.includes('"processId":"')
  );
}
function emitStructuredProjection(threadId, turnId, context) {
  const objective = objectiveSubject(
    (context.authoritative?.currentInstructions?.objective?.text ?? "topic work").trim(),
  );
  const output = {
    kind: "working_projection",
    milestones: projectionMilestones(context, objective),
  };
  if (context.requestedChannel === "terminal_projection") {
    output.kind = "terminal_projection";
    delete output.milestones;
    output.finalSummary = terminalProjectionSummary(context, objective);
  }
  emitAgentMessage(threadId, turnId, JSON.stringify(output));
  completeTurn(threadId, turnId, "completed");
  return true;
}

function emitStructuredFocus(threadId, turnId, context) {
  const objective = (
    context.authoritative?.currentInstructions?.objective?.text ?? "topic work"
  ).trim();
  emitAgentMessage(
    threadId,
    turnId,
    JSON.stringify({
      currentFocus: objective,
      kind: "focus_projection",
      sourceThroughSequence: context.sourceThroughSequence,
      topicDescriptor: context.trigger === "input_accepted" ? objective : null,
    }),
  );
  completeTurn(threadId, turnId, "completed");
  return true;
}
function projectionMilestones(context, objective) {
  const steering = context.authoritative?.currentInstructions?.acceptedSteering ?? [];
  const suppress =
    context.requestedChannel !== "terminal_projection" &&
    steering.some((item) => item.input?.text === simultaneousCompletionInput);
  if (suppress || context.priorMilestones?.length > 0) return [];
  return [`${objectiveSubject(objective)} has visible progress.`];
}
function terminalProjectionSummary(context, objective) {
  const subject = objectiveSubject(objective);
  const status = context.authoritative?.currentInstructions?.turnStatus;
  if (status === "completed") return `${subject} completed.`;
  if (status === "cancelled") return `${subject} stopped before completion.`;
  if (status === "failed") return `${subject} failed; the reported error remains visible.`;
  return `${subject} reached a terminal state.`;
}
function objectiveSubject(objective) {
  return objective === "" ? "Topic work" : objective[0].toUpperCase() + objective.slice(1);
}
function holdStructuredTurnOnce(context) {
  const key = structuredHoldKey(context);
  if (key === null || heldStructuredKeys.has(key)) {
    return false;
  }
  heldStructuredKeys.add(key);
  persistState();
  return true;
}
function structuredHoldKey(context) {
  if (isCancelledMasterRoute(context)) {
    return "master:cancel-route";
  }
  if (isCrashMasterRoute(context)) {
    return "master:crash-route";
  }
  if (isCrashNarratorProjection(context)) {
    return "narrator:crash-projection";
  }
  return null;
}

function isCancelledMasterRoute(context) {
  return (
    context.kind === "master_route" && context.input?.input?.text === "Cancel active master route."
  );
}

function isCrashMasterRoute(context) {
  return context.kind === "master_route" && context.input?.input?.text === "Crash master route.";
}

function isCrashNarratorProjection(context) {
  return (
    context.kind === "projection" &&
    context.requestedChannel === "terminal_projection" &&
    context.authoritative?.currentInstructions?.objective?.text === "crash narrator"
  );
}

function emitTurnScenario(threadId, turnId, text) {
  if (text === "director graph burst") {
    emitDirectorGraphBurst(threadId, turnId);
    return;
  }
  if (text === "director sustained profile") {
    emitDirectorSustainedProfile(threadId, turnId);
    return;
  }
  const profiledEventCount = performanceEventCount(text);
  if (profiledEventCount !== null) {
    emitProfiledTurn(threadId, turnId, text, profiledEventCount, 0);
    return;
  }
  emitTextDelta(threadId, turnId, `Streaming ${text}. `);
  if (text.includes("narration backlog")) {
    for (let index = 1; index <= 18; index += 1) {
      emitTextDelta(threadId, turnId, `backlog-${index.toString().padStart(2, "0")} `.repeat(600));
    }
  }
  if (text.includes("hold")) {
    emitSimultaneousAudioHoldProgress(emitAgentMessage, threadId, turnId, text);
    heldTurns.set(turnId, { threadId, text });
    return;
  }
  if (text.includes("command approval")) {
    requestCommandApproval(threadId, turnId);
    return;
  }
  if (text.includes("approval")) {
    requestApproval(threadId, turnId);
    return;
  }
  if (emitArtifactToolScenario(threadId, turnId, text)) {
    return;
  }
  emitLegacyArtifactIfRequested(threadId, turnId, text);
  if (text === "director fail" && failedDirectorInputs.has(text)) {
    emitAgentMessage(threadId, turnId, "Recovered director fail.");
    completeTurn(threadId, turnId, "completed");
    return;
  }
  if (text.includes("fail")) {
    if (text === "director fail") {
      failedDirectorInputs.add(text);
    }
    completeTurn(threadId, turnId, "failed", "Scripted topic failure");
    return;
  }
  emitAgentMessage(threadId, turnId, `Completed ${text}.`);
  completeTurn(threadId, turnId, "completed");
}

function emitDirectorGraphBurst(threadId, turnId) {
  const commandCount = 405;
  for (let index = 0; index < commandCount; index += 1) {
    const itemId = `director-burst-command-${turnId}-${String(index + 1).padStart(3, "0")}`;
    notify("item/started", {
      item: directorBurstCommand(itemId, "inProgress", null),
      startedAtMs: Date.now(),
      threadId,
      turnId,
    });
    notify("item/completed", {
      completedAtMs: Date.now(),
      item: directorBurstCommand(itemId, "completed", 0),
      threadId,
      turnId,
    });
  }
  emitAgentMessage(threadId, turnId, "Completed the Director graph burst.");
  completeTurn(threadId, turnId, "completed");
}

function directorBurstCommand(itemId, status, exitCode) {
  return {
    aggregatedOutput: "",
    command: "printf director-burst",
    commandActions: [],
    cwd: "/tmp",
    exitCode,
    id: itemId,
    status,
    type: "commandExecution",
  };
}

function emitDirectorSustainedProfile(threadId, turnId, startedAt = Date.now(), index = 0) {
  const configuredDuration = Number.parseInt(
    process.env.SETTA_E2E_DIRECTOR_SUSTAINED_MS ?? "60000",
    10,
  );
  const durationMs =
    Number.isInteger(configuredDuration) && configuredDuration > 0 ? configuredDuration : 60_000;
  emitTextDelta(threadId, turnId, `sustained-${String(index + 1).padStart(4, "0")} `);
  if (Date.now() - startedAt >= durationMs) {
    emitAgentMessage(threadId, turnId, "Completed the sustained Director profile.");
    completeTurn(threadId, turnId, "completed");
    return;
  }
  setTimeout(() => emitDirectorSustainedProfile(threadId, turnId, startedAt, index + 1), 50);
}

function performanceEventCount(text) {
  const match = /^Profile exactly (\d+) conversation events for pane \d+\.$/.exec(text);
  if (!match) {
    return null;
  }
  const count = Number.parseInt(match[1], 10);
  if (!Number.isInteger(count) || count < 1 || count > 2000) {
    throw new Error(`profile event count is invalid: ${match[1]}`);
  }
  return count;
}

function emitArtifactToolScenario(threadId, turnId, text) {
  const scenario = artifactPolicyScenarioForText(text);
  if (!scenario) {
    return false;
  }
  if (scenario.artifacts.length === 0) {
    emitAgentMessage(threadId, turnId, scenario.completion);
    completeTurn(threadId, turnId, "completed");
    return true;
  }
  emitArtifactToolCall(threadId, turnId, scenario, 0);
  return true;
}

function emitLegacyArtifactIfRequested(threadId, turnId, text) {
  if (text.includes("artifact")) {
    emitArtifact(threadId, turnId);
  }
}

function emitProfiledTurn(threadId, turnId, text, eventCount, emittedCount) {
  const chunkEnd = Math.min(eventCount, emittedCount + 8);
  for (let index = emittedCount; index < chunkEnd; index += 1) {
    emitTextDelta(threadId, turnId, `profile-${String(index + 1).padStart(4, "0")} `);
  }
  if (chunkEnd < eventCount) {
    setTimeout(() => emitProfiledTurn(threadId, turnId, text, eventCount, chunkEnd), 8);
    return;
  }
  emitAgentMessage(threadId, turnId, `Completed ${text}`);
  completeTurn(threadId, turnId, "completed");
}

function steerTurn(message) {
  const turnId = requiredString(message.params, "expectedTurnId");
  const held = heldTurns.get(turnId);
  if (!held) {
    respondError(message.id, -32602, `turn ${turnId} is not steerable`);
    return;
  }
  heldTurns.delete(turnId);
  respond(message.id, { turnId });
  const text = turnInputText(message.params);
  const completion = { held, text, turnId };
  if (text === simultaneousCompletionInput) {
    pendingSimultaneousCompletions.push(completion);
    if (pendingSimultaneousCompletions.length !== 2) {
      return;
    }
    const simultaneous = pendingSimultaneousCompletions.splice(0);
    setImmediate(() => simultaneous.forEach(completeSteeredTurn));
    return;
  }
  setImmediate(() => completeSteeredTurn(completion));
}

function completeSteeredTurn({ held, text, turnId }) {
  emitTextDelta(held.threadId, turnId, `Steered with ${text}. `);
  emitAgentMessage(held.threadId, turnId, `Steering completed ${held.text}.`);
  completeTurn(held.threadId, turnId, "completed");
}

function interruptTurn(message) {
  const turnId = requiredString(message.params, "turnId");
  const held = heldTurns.get(turnId);
  if (!held) {
    const threadId = requiredString(message.params, "threadId");
    const persistedTurn = turns.get(turnId);
    const persistedThread = loadedThreads.get(threadId) ?? durableThreads.get(threadId);
    if (persistedTurn?.status !== "inProgress" || !persistedThread?.turnIds.includes(turnId)) {
      respondError(message.id, -32602, `turn ${turnId} is not interruptible`);
      return;
    }
    respond(message.id, {});
    completeTurn(threadId, turnId, "interrupted");
    return;
  }
  heldTurns.delete(turnId);
  respond(message.id, {});
  setImmediate(() => completeTurn(held.threadId, turnId, "interrupted"));
}

function requestApproval(threadId, turnId) {
  approvalCounter += 1;
  persistState();
  const requestId = `topic-approval-${approvalCounter}`;
  pendingApprovals.set(requestId, { threadId, turnId });
  request(requestId, "item/tool/requestUserInput", {
    itemId: `approval-item-${turnId}`,
    questions: [
      {
        header: "Scope",
        id: "scope",
        isSecret: true,
        question: "Which scope should be used?",
      },
    ],
    threadId,
    turnId,
  });
}

function requestCommandApproval(threadId, turnId) {
  approvalCounter += 1;
  persistState();
  const requestId = `topic-approval-${approvalCounter}`;
  pendingApprovals.set(requestId, { threadId, turnId });
  request(requestId, "item/commandExecution/requestApproval", {
    command: "printf denied",
    itemId: `approval-item-${turnId}`,
    reason: "Verify the deny path",
    startedAtMs: Date.now(),
    threadId,
    turnId,
  });
}

function handleClientResponse(message) {
  const requestId = String(message.id);
  const pendingToolCall = pendingToolCalls.get(requestId);
  if (pendingToolCall) {
    handleToolCallResponse(requestId, pendingToolCall, message);
    return;
  }
  const pending = pendingApprovals.get(requestId);
  if (!pending) {
    throw new Error(`unexpected fake topic response ${requestId}`);
  }
  pendingApprovals.delete(requestId);
  if (!message.result) {
    throw new Error(`approval ${requestId} did not include a result`);
  }
  const denied = message.result.decision === "decline";
  setImmediate(() => {
    emitAgentMessage(
      pending.threadId,
      pending.turnId,
      denied
        ? "Command approval denied and work completed."
        : "Approval answered and work completed.",
    );
    completeTurn(pending.threadId, pending.turnId, "completed");
  });
}

function handleToolCallResponse(requestId, pending, message) {
  pendingToolCalls.delete(requestId);
  const action = artifactToolResponseAction(requestId, pending, message);
  if (action.kind === "next") {
    setImmediate(() =>
      emitArtifactToolCall(pending.threadId, pending.turnId, pending.scenario, action.nextIndex),
    );
    return;
  }
  setImmediate(() => {
    emitAgentMessage(pending.threadId, pending.turnId, pending.scenario.completion);
    completeTurn(pending.threadId, pending.turnId, "completed");
  });
}

function emitArtifact(threadId, turnId) {
  notify("item/completed", {
    completedAtMs: Date.now(),
    item: {
      id: `image-${turnId}`,
      result: "generated",
      savedPath: `/tmp/${turnId}-artifact.png`,
      status: "completed",
      type: "imageGeneration",
    },
    threadId,
    turnId,
  });
}

function emitTextDelta(threadId, turnId, delta) {
  notify("item/agentMessage/delta", {
    delta,
    itemId: `agent-${turnId}`,
    threadId,
    turnId,
  });
}

function emitAgentMessage(threadId, turnId, text, itemId = `agent-${turnId}`) {
  notify("item/completed", {
    completedAtMs: Date.now(),
    item: { id: itemId, text, type: "agentMessage" },
    threadId,
    turnId,
  });
}

function emitArtifactToolCall(threadId, turnId, scenario, index) {
  const thread = loadedThreads.get(threadId) ?? durableThreads.get(threadId);
  if (!threadHasArtifactTool(thread)) {
    completeTurn(threadId, turnId, "failed", "setta.emit_artifact was not registered");
    return;
  }
  const artifactArguments = scenario.artifacts[index];
  if (!artifactArguments) {
    completeTurn(threadId, turnId, "failed", "artifact tool scenario index was invalid");
    return;
  }
  toolCallCounter += 1;
  persistState();
  const requestId = `topic-artifact-tool-${toolCallCounter}`;
  pendingToolCalls.set(requestId, {
    arguments: artifactArguments,
    index,
    scenario,
    threadId,
    turnId,
  });
  request(requestId, "item/tool/call", {
    arguments: artifactArguments,
    callId: `artifact-call-${toolCallCounter}`,
    namespace: "setta",
    threadId,
    tool: "emit_artifact",
    turnId,
  });
}

function completeTurn(threadId, turnId, status, message = "") {
  const turn = fakeTurn(turnId, status);
  if (message !== "") {
    turn.error = { message };
  }
  turns.set(turnId, turn);
  persistState();
  notify("turn/completed", { threadId, turn });
  if (status === "completed" && crashAfterCompletedTurns.has(turnId)) {
    crashAfterCompletedTurns.delete(turnId);
    crashCounter += 1;
    persistState();
    setImmediate(() => process.exit(42));
  }
}

function readPersistedState() {
  const empty = {
    approvalCounter: 0,
    crashCounter: 0,
    heldStructuredKeys: [],
    heldTurnStartKeys: [],
    methodLog: [],
    processGeneration: 0,
    threadCounter: 0,
    toolCallCounter: 0,
    threads: [],
    turnCounter: 0,
    turns: [],
  };
  if (persistedStatePath === "" || !existsSync(persistedStatePath)) {
    return empty;
  }
  const state = JSON.parse(readFileSync(persistedStatePath, "utf8"));
  state.crashCounter ??= 0;
  if (!persistedStateIsValid(state)) {
    throw new Error("fake topic Codex state is malformed");
  }
  interruptStaleDurableTurns(state);
  writeFileSync(persistedStatePath, `${JSON.stringify(state)}\n`, "utf8");
  return state;
}

function persistedStateIsValid(state) {
  return [
    Number.isInteger(state.approvalCounter),
    Number.isInteger(state.crashCounter),
    Array.isArray(state.heldStructuredKeys),
    Array.isArray(state.heldTurnStartKeys),
    Array.isArray(state.methodLog),
    Number.isInteger(state.processGeneration),
    Number.isInteger(state.threadCounter),
    Number.isInteger(state.toolCallCounter),
    Number.isInteger(state.turnCounter),
    Array.isArray(state.threads),
    Array.isArray(state.turns),
  ].every(Boolean);
}

function interruptStaleDurableTurns(state) {
  const durableTurnIds = new Set(
    state.threads
      .filter((thread) => thread.ephemeral !== true)
      .flatMap((thread) => (Array.isArray(thread.turnIds) ? thread.turnIds : [])),
  );
  state.turns = state.turns.map((turn) =>
    durableTurnIds.has(turn.id) && turn.status === "inProgress"
      ? { ...turn, status: "interrupted" }
      : turn,
  );
}

function persistState() {
  if (persistedStatePath === "") {
    return;
  }
  const payload = `${JSON.stringify({
    approvalCounter,
    crashCounter,
    heldStructuredKeys: [...heldStructuredKeys],
    heldTurnStartKeys: [...heldTurnStartKeys],
    methodLog,
    processGeneration,
    threadCounter,
    threads: [...durableThreads.values()],
    toolCallCounter,
    turnCounter,
    turns: [...turns.values()],
  })}\n`;
  const tempPath = `${persistedStatePath}.tmp`;
  writeFileSync(tempPath, payload, "utf8");
  renameSync(tempPath, persistedStatePath);
}

function materializeDurableThread(thread) {
  if (thread.ephemeral === true) {
    return;
  }
  durableThreads.set(thread.id, thread);
  persistState();
}

function recordProviderMethod(method, params = {}, extra = {}) {
  methodSequence += 1;
  methodLog.push(providerMethodLogEntry(method, params, extra));
  persistState();
}

function providerMethodLogEntry(method, params, extra) {
  return {
    archived: firstDefined(params.archived),
    cursor: firstDefined(params.cursor),
    excludeTurns: firstDefined(params.excludeTurns),
    generation: processGeneration,
    includeTurns: firstDefined(params.includeTurns),
    inputText: firstDefined(extra.inputText),
    method,
    sequence: methodSequence,
    threadId: firstDefined(extra.threadId, params.threadId),
    turnId: firstDefined(extra.turnId, params.turnId, params.expectedTurnId),
  };
}

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined) return value;
  }
  return null;
}

function fakeModel(id, effort, isDefault) {
  return {
    defaultReasoningEffort: effort,
    description: `${id} scripted topic model`,
    displayName: id,
    hidden: false,
    id,
    inputModalities: ["text"],
    isDefault,
    model: id,
    supportedReasoningEfforts: [{ description: effort, reasoningEffort: effort }],
  };
}

function fakeThread(threadId) {
  const state = loadedThreads.get(threadId) ?? durableThreads.get(threadId);
  return {
    cliVersion: "fake",
    createdAt: 1,
    cwd: state?.cwd ?? "/tmp/setta-topic-codex",
    ephemeral: state?.ephemeral === true,
    forkedFromId: state?.forkedFromId ?? null,
    id: threadId,
    modelProvider: "fake",
    path: state?.ephemeral === true ? null : `/tmp/setta-topic-codex/${threadId}.jsonl`,
    preview: "",
    sessionId: `session-${threadId}`,
    source: "user",
    status: { type: "idle" },
    turns: [],
    updatedAt: 1,
  };
}

function threadOperationResponse(thread, state) {
  return {
    approvalPolicy: state.approvalPolicy ?? "never",
    approvalsReviewer: "user",
    cwd: state.cwd ?? "/tmp/setta-topic-codex",
    instructionSources: [],
    model: state.model,
    modelProvider: "fake",
    reasoningEffort: state.reasoningEffort ?? restrictedThread.modelReasoningEffort(state.model),
    runtimeWorkspaceRoots: state.runtimeWorkspaceRoots ?? [],
    sandbox: restrictedThread.sandboxPolicy(state.sandbox ?? "workspace-write"),
    serviceTier: state.serviceTier ?? null,
    thread,
  };
}

function fakeTurn(turnId, status) {
  return { id: turnId, items: [], status };
}

function turnInputText(params) {
  const items = params?.input;
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("turn input is required");
  }
  return items.map((item) => item?.text ?? "").join("\n");
}

function requiredString(value, field) {
  const result = value?.[field];
  if (typeof result !== "string" || result === "") {
    throw new Error(`${field} is required`);
  }
  return result;
}

function respond(id, result) {
  write({ id, jsonrpc: "2.0", result });
}

function respondError(id, code, message) {
  write({ error: { code, message }, id, jsonrpc: "2.0" });
}

function respondThreadNotFound(id, method, threadId) {
  respondError(id, -32600, `no rollout found for thread id ${threadId}`);
}

function notify(method, params) {
  write({ jsonrpc: "2.0", method, params });
}

function request(id, method, params) {
  write({ id, jsonrpc: "2.0", method, params });
}

function write(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}
