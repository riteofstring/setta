import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
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
  nonEmptyString,
  optionalNonNegativeIntegerEnvironment,
  validSideBoundary,
  validSideContextFrame,
} from "./fake-topic-codex-app-server-helpers.mjs";
import {
  decodeDirectorToolReceipt,
  directorScenarioForTurn,
  directorToolCallForStep,
  threadHasDirectorTools,
} from "./fake-topic-codex-director-tools.mjs";
import * as structuredCall from "./fake-topic-codex-structured-call.mjs";
const persistedStatePath = process.env.SETTA_E2E_TOPIC_CODEX_STATE_PATH ?? "";
const initialThreadStartDelayMs = optionalNonNegativeIntegerEnvironment(
  "SETTA_E2E_TOPIC_CODEX_INITIAL_THREAD_START_DELAY_MS",
);
const turnDelayMs = optionalNonNegativeIntegerEnvironment("SETTA_E2E_TOPIC_CODEX_TURN_DELAY_MS");
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
const loadedThreads = new Map();
const turns = new Map();
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
  ["thread/inject_items", injectThreadItems],
  ["thread/start", startThread],
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
  const structured = params.allowProviderModelFallback === false;
  if (structured) {
    structuredCall.assertStructuredCallParams(params);
  }
  if (params.ephemeral !== true) {
    respondError(message.id, -32602, "Setta conversation carriers must be ephemeral");
    return;
  }
  const delayInitialResponse = threadCounter === 0 && initialThreadStartDelayMs > 0;
  threadCounter += 1;
  const threadId = `topic-thread-${threadCounter}`;
  const state = startThreadState(params, threadId, structured);
  loadedThreads.set(threadId, state);
  recordProviderMethod("thread/start", params, {
    carrierKind: providerCarrierKind(state),
    ephemeral: state.ephemeral,
    isDirector: threadHasDirectorTools(state),
    threadId,
  });
  persistState();
  const sendResponse = () =>
    respond(message.id, threadOperationResponse(fakeThread(threadId), state));
  if (delayInitialResponse) {
    setTimeout(sendResponse, initialThreadStartDelayMs);
    return;
  }
  sendResponse();
}
function startThreadState(params, threadId, structured) {
  return {
    approvalPolicy: params.approvalPolicy ?? null,
    cwd: requiredString(params, "cwd"),
    developerInstructions: params.developerInstructions ?? null,
    dynamicTools: params.dynamicTools ?? [],
    ephemeral: params.ephemeral === true,
    id: threadId,
    model: params.model ?? "gpt-5.6-sol",
    reasoningEffort: params.config?.model_reasoning_effort ?? null,
    side: isSideCarrierInstructions(params.developerInstructions),
    structured,
    runtimeWorkspaceRoots: params.runtimeWorkspaceRoots ?? [],
    sandbox: params.sandbox ?? null,
    serviceTier: startThreadServiceTier(params, structured),
    turnIds: [],
  };
}
function startThreadServiceTier(params, structured) {
  if (structured && params.serviceTier === null) return "default";
  return params.serviceTier ?? null;
}

function injectThreadItems(message) {
  const params = message.params ?? {};
  const threadId = requiredString(params, "threadId");
  const thread = loadedThreads.get(threadId);
  const carrierKind = providerCarrierKind(thread);
  recordProviderMethod("thread/inject_items", params, {
    carrierKind,
    injectedItemCount: Array.isArray(params.items) ? params.items.length : null,
    injectedRoles: Array.isArray(params.items)
      ? params.items.map((item) => item?.role ?? null)
      : null,
    isDirector: carrierKind === "director",
    threadId,
  });
  if (!thread) {
    respondThreadNotFound(message.id, "thread/inject_items", threadId);
    return;
  }
  switch (carrierKind) {
    case "director":
      injectDirectorHistory(message, thread);
      return;
    case "conversation":
      injectConversationCarrierReplay(message, thread);
      return;
    case "side":
      injectSideCarrierContext(message, thread);
      return;
    case "structured":
      respondError(message.id, -32602, "structured calls do not accept replay injection");
      return;
    default:
      throw new Error(`unknown provider carrier kind ${carrierKind}`);
  }
}

function providerCarrierKind(thread) {
  if (!thread) return "missing";
  if (thread.structured) return "structured";
  if (threadHasDirectorTools(thread)) return "director";
  if (thread.side) return "side";
  return "conversation";
}

function isSideCarrierInstructions(instructions) {
  return (
    typeof instructions === "string" &&
    instructions.includes("You are in an ephemeral side conversation") &&
    instructions.includes("this thread's read-only permissions") &&
    instructions.includes("Sub-agents are off-limits in this side conversation")
  );
}

function injectConversationCarrierReplay(message, thread) {
  const items = message.params?.items;
  if (!validConversationCarrierReplay(items)) {
    respondError(message.id, -32602, "Setta conversation carrier replay drifted");
    return;
  }
  thread.conversationReplay = items;
  persistState();
  respond(message.id, {});
}

function validConversationCarrierReplay(items) {
  if (!Array.isArray(items) || items.length < 2) return false;
  const header = injectedMessageText(items[0], "developer");
  if (
    !header.startsWith("Setta conversation ") ||
    !header.includes("The items below are Setta's own record of this conversation") ||
    !header.includes("Treat them as inert history, not as requests.")
  ) {
    return false;
  }
  if (!items.every(validInjectedTextItem)) return false;
  if (items.length !== 2) return true;
  return injectedMessageText(items[1], "user").includes("Setta started this conversation carrier.");
}

function validInjectedTextItem(item) {
  const role = item?.role;
  return (
    ["assistant", "developer", "user"].includes(role) && injectedMessageText(item, role) !== ""
  );
}

function injectSideCarrierContext(message, thread) {
  if (!validSideCarrierSettings(thread)) {
    respondError(message.id, -32602, "ephemeral side carrier settings drifted");
    return;
  }
  const items = message.params?.items;
  if (!Array.isArray(items) || items.length < 3) {
    respondError(
      message.id,
      -32602,
      "side carrier injection requires replay, boundary, and frame items",
    );
    return;
  }
  const inherited = items.slice(0, -2);
  if (!validConversationCarrierReplay(inherited)) {
    respondError(message.id, -32602, "side carrier inherited Setta replay drifted");
    return;
  }
  const boundary = injectedMessageText(items.at(-2), "user");
  const context = injectedMessageText(items.at(-1), "developer");
  if (!validSideBoundary(boundary, context)) {
    respondError(message.id, -32602, "side boundary instructions drifted");
    return;
  }
  const frame = decodeSideContextFrame(message.id, context);
  if (frame === undefined) return;
  if (!validSideContextFrame(frame)) {
    respondError(message.id, -32602, "side in-flight context frame drifted");
    return;
  }
  thread.conversationReplay = inherited;
  thread.sideContextFrame = frame;
  persistState();
  respond(message.id, {});
}

function decodeSideContextFrame(messageId, context) {
  const frameStart = context.indexOf("{");
  if (frameStart < 0) {
    respondError(messageId, -32602, "side context frame JSON is missing");
    return undefined;
  }
  try {
    return JSON.parse(context.slice(frameStart));
  } catch {
    respondError(messageId, -32602, "side context frame JSON is invalid");
    return undefined;
  }
}

function validSideCarrierSettings(thread) {
  return [
    thread.ephemeral === true,
    thread.model === "gpt-5.6-luna",
    thread.approvalPolicy === "never",
    thread.sandbox === "read-only",
    thread.serviceTier === null,
    thread.reasoningEffort === "medium",
    isSideCarrierInstructions(thread.developerInstructions),
  ].every(Boolean);
}

function injectDirectorHistory(message, thread) {
  const items = message.params?.items;
  if (!Array.isArray(items) || items.length === 0) {
    respondError(message.id, -32602, "Director history injection requires at least one item");
    return;
  }
  if (!items.every(validInjectedTextItem)) {
    respondError(message.id, -32602, "Director history injection drifted");
    return;
  }
  thread.directorHistory = items;
  persistState();
  respond(message.id, {});
}

function injectedMessageText(item, role) {
  if (!Array.isArray(item?.content)) return "";
  const [content] = item.content;
  const contentType = role === "assistant" ? "output_text" : "input_text";
  const valid = [
    item.type === "message",
    item.role === role,
    item.content.length === 1,
    content?.type === contentType,
    typeof content?.text === "string",
  ].every(Boolean);
  if (!valid) return "";
  return content.text;
}

function readThread(message) {
  const threadId = requiredString(message.params, "threadId");
  recordProviderMethod("thread/read", message.params ?? {}, { threadId });
  const threadState = loadedThreads.get(threadId);
  if (!threadState) {
    respondThreadNotFound(message.id, "thread/read", threadId);
    return;
  }
  if (message.params?.includeTurns === true) {
    respondError(message.id, -32602, "ephemeral threads do not support includeTurns");
    return;
  }
  const thread = fakeThread(threadId);
  thread.status = threadState.turnIds.some((turnId) => turns.get(turnId)?.status === "inProgress")
    ? { activeFlags: [], type: "active" }
    : { type: "idle" };
  respond(message.id, { thread });
}

function listThreads(message) {
  const params = message.params ?? {};
  recordProviderMethod("thread/list", params, {});
  listCursorOffset(params.cursor);
  listLimit(params.limit);
  respond(message.id, {
    backwardsCursor: null,
    data: [],
    nextCursor: null,
  });
}

function startTurn(message) {
  const threadId = requiredString(message.params, "threadId");
  const text = turnInputText(message.params);
  const thread = loadedThreads.get(threadId);
  const carrierKind = providerCarrierKind(thread);
  recordProviderMethod("turn/start", message.params ?? {}, {
    carrierKind,
    inputText: text,
    isDirector: carrierKind === "director",
    threadId,
  });
  if (!thread) {
    respondThreadNotFound(message.id, "turn/start", threadId);
    return;
  }
  if (!providerCarrierHasRequiredReplay(thread, carrierKind)) {
    respondError(message.id, -32602, `${carrierKind} carrier started without Setta replay`);
    return;
  }
  turnCounter += 1;
  const turnId = `topic-turn-${turnCounter}`;
  const turn = fakeTurn(turnId, "inProgress");
  turns.set(turnId, turn);
  thread.turnIds.push(turnId);
  if (text === "provider lifecycle crash idle turn") {
    crashAfterCompletedTurns.add(turnId);
  }
  persistState();
  if (holdTurnStartOnce(text)) {
    return;
  }
  respond(message.id, { turn });
  setImmediate(() => {
    if (threadHasDirectorTools(thread)) {
      emitDirectorTurnScenario(threadId, turnId, text, thread.directorHistory ?? []);
      return;
    }
    if (message.params?.outputSchema) {
      emitStructuredTurn(threadId, turnId, text, message.params.outputSchema);
      return;
    }
    emitTurnScenario(threadId, turnId, text);
  }, turnDelayMs);
}

function providerCarrierHasRequiredReplay(thread, carrierKind) {
  switch (carrierKind) {
    case "conversation":
      return Array.isArray(thread.conversationReplay);
    case "director":
      return Array.isArray(thread.directorHistory);
    case "side":
      return (
        Array.isArray(thread.conversationReplay) && validSideContextFrame(thread.sideContextFrame)
      );
    case "structured":
      return true;
    default:
      return false;
  }
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
  focus: emitStructuredFocus,
  projection: emitStructuredProjection,
  status: emitStructuredStatus,
};

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
  if (isCrashNarratorProjection(context)) {
    return "narrator:crash-projection";
  }
  return null;
}

function isCrashNarratorProjection(context) {
  return (
    context.kind === "projection" &&
    context.requestedChannel === "terminal_projection" &&
    context.authoritative?.currentInstructions?.objective?.text === "crash narrator"
  );
}

function emitDirectorTurnScenario(threadId, turnId, text, history) {
  const thread = loadedThreads.get(threadId);
  if (thread?.awaitingDirectorReview === true) {
    const review =
      thread?.pendingDirectorReview ??
      (nonEmptyString(thread?.lastDirectorReply)
        ? { delayMs: 0, reply: thread.lastDirectorReply, review: null, steps: [] }
        : null);
    if (review === null) {
      completeTurn(threadId, turnId, "failed", "Director review had no preceding reply");
      return;
    }
    thread.awaitingDirectorReview = false;
    thread.pendingDirectorReview = null;
    emitDirectorScenario(threadId, turnId, review);
    return;
  }
  const scenario = directorScenarioForTurn(text, history);
  if (scenario === null) {
    completeTurn(threadId, turnId, "failed", `unsupported Director turn ${text}`);
    return;
  }
  thread.awaitingDirectorReview = scenario.steps.length === 0;
  thread.pendingDirectorReview = scenario.review;
  emitDirectorScenario(threadId, turnId, scenario);
}

function emitDirectorScenario(threadId, turnId, scenario) {
  const call = directorToolCallForStep(scenario, 0, []);
  if (call === null) {
    completeDirectorScenario(threadId, turnId, scenario);
    return;
  }
  emitDirectorToolCall(threadId, turnId, scenario, 0, [], call);
}

function emitTurnScenario(threadId, turnId, text) {
  if (emitProfilingTurnScenario(threadId, turnId, text)) {
    return;
  }
  emitTextDelta(threadId, turnId, `Streaming ${text}. `);
  if (text.includes("narration backlog")) {
    for (let index = 1; index <= 18; index += 1) {
      emitTextDelta(threadId, turnId, `backlog-${index.toString().padStart(2, "0")} `.repeat(600));
    }
  }
  if (emitInterruptingTurnScenario(threadId, turnId, text)) {
    return;
  }
  if (emitArtifactToolScenario(threadId, turnId, text)) {
    return;
  }
  emitLegacyArtifactIfRequested(threadId, turnId, text);
  if (emitFailingTurnScenario(threadId, turnId, text)) {
    return;
  }
  emitAgentMessage(threadId, turnId, `Completed ${text}.`);
  completeTurn(threadId, turnId, "completed");
}

function emitProfilingTurnScenario(threadId, turnId, text) {
  if (text === "director graph burst") {
    emitDirectorGraphBurst(threadId, turnId);
    return true;
  }
  if (text === "director sustained profile") {
    emitDirectorSustainedProfile(threadId, turnId);
    return true;
  }
  const profiledEventCount = performanceEventCount(text);
  if (profiledEventCount === null) {
    return false;
  }
  emitProfiledTurn(threadId, turnId, text, profiledEventCount, 0);
  return true;
}

function emitInterruptingTurnScenario(threadId, turnId, text) {
  if (text.includes("hold")) {
    emitSimultaneousAudioHoldProgress(emitAgentMessage, threadId, turnId, text);
    heldTurns.set(turnId, { threadId, text });
    return true;
  }
  if (text.includes("command approval")) {
    requestCommandApproval(threadId, turnId);
    return true;
  }
  if (text.includes("approval")) {
    requestApproval(threadId, turnId);
    return true;
  }
  return false;
}

function emitFailingTurnScenario(threadId, turnId, text) {
  if (text === "director fail" && failedDirectorInputs.has(text)) {
    emitAgentMessage(threadId, turnId, "Recovered director fail.");
    completeTurn(threadId, turnId, "completed");
    return true;
  }
  if (!text.includes("fail")) {
    return false;
  }
  if (text === "director fail") {
    failedDirectorInputs.add(text);
  }
  completeTurn(threadId, turnId, "failed", "Scripted topic failure");
  return true;
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
  const match = /^Profile exactly (\d+) conversation events for workstream \d+\.$/.exec(text);
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
  materializeArtifactScenarioFiles(threadId, scenario);
  if (scenario.artifacts.length === 0) {
    emitAgentMessage(threadId, turnId, scenario.completion);
    completeTurn(threadId, turnId, "completed");
    return true;
  }
  emitArtifactToolCall(threadId, turnId, scenario, 0);
  return true;
}

function materializeArtifactScenarioFiles(threadId, scenario) {
  const workspaceFiles = scenario.workspaceFiles ?? [];
  if (workspaceFiles.length === 0) {
    return;
  }
  const workspaceRoot = loadedThreads.get(threadId)?.cwd;
  if (!workspaceRoot) {
    throw new Error(`artifact scenario thread ${threadId} has no workspace`);
  }
  for (const relativePath of workspaceFiles) {
    const absolutePath = join(workspaceRoot, relativePath);
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, "fake artifact workspace file");
  }
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
    const activeTurn = turns.get(turnId);
    const activeThread = loadedThreads.get(threadId);
    if (activeTurn?.status !== "inProgress" || !activeThread?.turnIds.includes(turnId)) {
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
  if (pending.kind === "director") {
    handleDirectorToolCallResponse(requestId, pending, message);
    return;
  }
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

function handleDirectorToolCallResponse(requestId, pending, message) {
  const receipt = decodeDirectorToolReceipt(
    requestId,
    pending.call.tool,
    message,
    pending.call.succeeds !== false,
  );
  const receipts = [...pending.receipts, receipt];
  const nextIndex = pending.index + 1;
  const next = directorToolCallForStep(pending.scenario, nextIndex, receipts);
  if (next !== null) {
    setImmediate(() =>
      emitDirectorToolCall(
        pending.threadId,
        pending.turnId,
        pending.scenario,
        nextIndex,
        receipts,
        next,
      ),
    );
    return;
  }
  setImmediate(() => completeDirectorScenario(pending.threadId, pending.turnId, pending.scenario));
}

function emitArtifact(threadId, turnId) {
  // An artifact addresses a file inside the conversation's authorized
  // workspace, so a generated image saves under the carrier's own cwd.
  const workspaceRoot = loadedThreads.get(threadId)?.cwd ?? "/tmp/setta-topic-codex";
  const savedPath = `${workspaceRoot}/${turnId}-artifact.png`;
  writeFileSync(savedPath, "fake generated image");
  notify("item/completed", {
    completedAtMs: Date.now(),
    item: {
      id: `image-${turnId}`,
      result: "generated",
      savedPath,
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

function emitDirectorToolCall(threadId, turnId, scenario, index, receipts, call) {
  const thread = loadedThreads.get(threadId);
  if (!threadHasDirectorTools(thread)) {
    completeTurn(threadId, turnId, "failed", "Director Setta tools were not registered");
    return;
  }
  toolCallCounter += 1;
  persistState();
  const requestId = `topic-director-tool-${toolCallCounter}`;
  pendingToolCalls.set(requestId, {
    call,
    index,
    kind: "director",
    receipts,
    scenario,
    threadId,
    turnId,
  });
  request(requestId, "item/tool/call", {
    arguments: call.arguments,
    callId: `director-call-${toolCallCounter}`,
    namespace: "setta",
    threadId,
    tool: call.tool,
    turnId,
  });
}

function completeDirectorTurn(threadId, turnId, reply) {
  const thread = loadedThreads.get(threadId);
  if (thread) {
    thread.lastDirectorReply = reply;
  }
  emitTextDelta(threadId, turnId, reply);
  emitAgentMessage(threadId, turnId, reply);
  completeTurn(threadId, turnId, "completed");
}

function completeDirectorScenario(threadId, turnId, scenario) {
  if (scenario.delayMs > 0) {
    setTimeout(() => completeDirectorTurn(threadId, turnId, scenario.reply), scenario.delayMs);
    return;
  }
  completeDirectorTurn(threadId, turnId, scenario.reply);
}

function emitArtifactToolCall(threadId, turnId, scenario, index) {
  const thread = loadedThreads.get(threadId);
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
    kind: "artifact",
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
    turnCounter: 0,
  };
  if (persistedStatePath === "" || !existsSync(persistedStatePath)) {
    return empty;
  }
  const state = JSON.parse(readFileSync(persistedStatePath, "utf8"));
  state.crashCounter ??= 0;
  if (!persistedStateIsValid(state)) {
    throw new Error("fake topic Codex state is malformed");
  }
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
  ].every(Boolean);
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
    toolCallCounter,
    turnCounter,
  })}\n`;
  const tempPath = `${persistedStatePath}.tmp`;
  writeFileSync(tempPath, payload, "utf8");
  renameSync(tempPath, persistedStatePath);
}

function recordProviderMethod(method, params = {}, extra = {}) {
  methodSequence += 1;
  methodLog.push(providerMethodLogEntry(method, params, extra));
  persistState();
}

function providerMethodLogEntry(method, params, extra) {
  return {
    archived: firstDefined(params.archived),
    carrierKind: firstDefined(extra.carrierKind),
    cursor: firstDefined(params.cursor),
    ephemeral: firstDefined(extra.ephemeral),
    excludeTurns: firstDefined(params.excludeTurns),
    generation: processGeneration,
    includeTurns: firstDefined(params.includeTurns),
    injectedItemCount: firstDefined(extra.injectedItemCount),
    injectedRoles: firstDefined(extra.injectedRoles),
    inputText: firstDefined(extra.inputText),
    isDirector: firstDefined(extra.isDirector),
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
  const state = loadedThreads.get(threadId);
  return {
    cliVersion: "fake",
    createdAt: 1,
    cwd: state?.cwd ?? "/tmp/setta-topic-codex",
    ephemeral: state?.ephemeral === true,
    forkedFromId: null,
    id: threadId,
    modelProvider: "fake",
    path: null,
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
    reasoningEffort: state.reasoningEffort ?? modelReasoningEffort(state.model),
    runtimeWorkspaceRoots: state.runtimeWorkspaceRoots ?? [],
    sandbox: sandboxPolicy(state.sandbox ?? "workspace-write"),
    serviceTier: state.serviceTier ?? null,
    thread,
  };
}

function sandboxPolicy(mode) {
  switch (mode) {
    case "read-only":
      return { networkAccess: false, type: "readOnly" };
    case "workspace-write":
      return {
        excludeSlashTmp: false,
        excludeTmpdirEnvVar: false,
        networkAccess: false,
        type: "workspaceWrite",
        writableRoots: [],
      };
    case "danger-full-access":
      return { type: "dangerFullAccess" };
    default:
      throw new Error(`unsupported sandbox mode ${mode}`);
  }
}

function modelReasoningEffort(model) {
  if (model === "gpt-5.4-mini") return "low";
  if (model === "gpt-5.6-terra") return "medium";
  if (model === "gpt-5.6-luna") return "medium";
  return "high";
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
