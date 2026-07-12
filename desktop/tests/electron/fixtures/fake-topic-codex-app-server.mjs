import { existsSync, readFileSync, writeFileSync } from "node:fs";
import process from "node:process";
import readline from "node:readline";
import { setImmediate } from "node:timers";

const persistedStatePath = process.env.SETTA_E2E_TOPIC_CODEX_STATE_PATH ?? "";
const persistedState = readPersistedState();
let threadCounter = persistedState.threadCounter;
let turnCounter = persistedState.turnCounter;
let approvalCounter = persistedState.approvalCounter;
const threads = new Map(persistedState.threads.map((thread) => [thread.id, thread]));
const turns = new Map(persistedState.turns.map((turn) => [turn.id, turn]));
const heldTurns = new Map();
const pendingApprovals = new Map();
const failedNarratorObjectives = new Set();
const methodHandlers = new Map([
  ["initialize", initialize],
  ["initialized", () => {}],
  ["model/list", listModels],
  ["thread/fork", forkThread],
  ["thread/inject_items", injectThreadItems],
  ["thread/start", startThread],
  ["thread/resume", resumeThread],
  ["thread/read", readThread],
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

function listModels(message) {
  respond(message.id, {
    data: [
      fakeModel("gpt-5.6-sol", "high", true),
      fakeModel("gpt-5.6-luna", "medium", false),
      fakeModel("gpt-5.4-mini", "low", false),
    ],
    nextCursor: null,
  });
}

function unsubscribeThread(message) {
  respond(message.id, { status: "unsubscribed" });
}

function terminateBackgroundTerminals(message) {
  respond(message.id, { terminated: true });
}

function startThread(message) {
  const params = message.params ?? {};
  threadCounter += 1;
  const threadId = `topic-thread-${threadCounter}`;
  const state = {
    approvalPolicy: params.approvalPolicy ?? null,
    cwd: requiredString(params, "cwd"),
    ephemeral: params.ephemeral === true,
    id: threadId,
    model: requiredString(params, "model"),
    sandbox: params.sandbox ?? null,
    serviceTier: params.serviceTier ?? null,
    turnIds: [],
  };
  threads.set(threadId, state);
  persistState();
  respond(message.id, threadOperationResponse(fakeThread(threadId), state));
}

function forkThread(message) {
  const params = message.params ?? {};
  const parentThreadId = requiredString(params, "threadId");
  const parent = threads.get(parentThreadId);
  if (!parent) {
    respondError(message.id, -32602, `unknown parent thread ${parentThreadId}`);
    return;
  }
  const ephemeral = params.ephemeral === true;
  const sourceTurnIds = forkSourceTurns(message, parent, ephemeral);
  if (!sourceTurnIds) return;
  threadCounter += 1;
  const threadId = `topic-thread-${threadCounter}`;
  const state = forkThreadState(params, parentThreadId, threadId, ephemeral, sourceTurnIds);
  threads.set(threadId, state);
  persistState();
  const thread = fakeThread(threadId);
  thread.turns = state.turnIds.map((turnId) => turns.get(turnId));
  respond(message.id, threadOperationResponse(thread, state));
}

function forkSourceTurns(message, parent, ephemeral) {
  if (ephemeral) return ephemeralSideSourceTurns(message, parent);
  return durableForkSourceTurns(message, parent);
}

function forkThreadState(params, parentThreadId, threadId, ephemeral, sourceTurnIds) {
  const config = params.config ?? {};
  return {
    approvalPolicy: params.approvalPolicy ?? null,
    cwd: requiredString(params, "cwd"),
    developerInstructions: params.developerInstructions ?? null,
    ephemeral,
    forkedFromId: parentThreadId,
    id: threadId,
    model: requiredString(params, "model"),
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
  if (parent.turnIds.length === 0) {
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
    params.approvalPolicy === "on-request",
    params.sandbox === "read-only",
    params.serviceTier === null,
    config.model_reasoning_effort === "medium",
    instructions.includes("ephemeral side conversation"),
  ].every(Boolean);
}

function injectThreadItems(message) {
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

function sideContextInjectionRequest(message) {
  const params = message.params ?? {};
  const threadId = requiredString(params, "threadId");
  const thread = threads.get(threadId);
  if (!thread || thread.ephemeral !== true || !thread.forkedFromId) {
    respondError(message.id, -32602, `thread ${threadId} is not an ephemeral side fork`);
    return;
  }
  const items = params.items;
  if (!Array.isArray(items) || items.length !== 2) {
    respondError(message.id, -32602, "side context injection requires boundary and frame items");
    return null;
  }
  return { items, thread };
}

function validSideBoundary(boundary, context) {
  return [
    boundary.includes("Side conversation boundary."),
    boundary.includes("Everything before this boundary is inherited history"),
    boundary.includes("Only messages submitted after this boundary are active"),
    context.includes("typed SideInFlightContextFrame"),
  ].every(Boolean);
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

function validSideContextFrame(frame) {
  if (
    frame?.type !== "side_in_flight_context_frame" ||
    !Number.isInteger(frame.sourceTrajectorySequence) ||
    frame.sourceTrajectorySequence < 0 ||
    !Array.isArray(frame.acceptedSteering) ||
    !Array.isArray(frame.activeActivities) ||
    !Array.isArray(frame.pendingApprovals) ||
    !Array.isArray(frame.artifacts)
  ) {
    return false;
  }
  const serialized = JSON.stringify(frame);
  return ![
    '"providerItemId"',
    '"providerThreadId"',
    '"providerTurnId"',
    '"processId"',
    '"privateReasoning"',
    '"rawToolOutput"',
  ].some((forbidden) => serialized.includes(forbidden));
}

function resumeThread(message) {
  const threadId = requiredString(message.params, "threadId");
  const state = threads.get(threadId) ?? {
    ephemeral: false,
    id: threadId,
    model: "gpt-5.6-sol",
    turnIds: [],
  };
  threads.set(threadId, state);
  persistState();
  respond(message.id, threadOperationResponse(fakeThread(threadId), state));
}

function readThread(message) {
  const threadId = requiredString(message.params, "threadId");
  const threadState = threads.get(threadId);
  if (!threadState) {
    respondError(message.id, -32602, `unknown thread ${threadId}`);
    return;
  }
  const thread = fakeThread(threadId);
  thread.turns = threadState.turnIds.map((turnId) => turns.get(turnId));
  thread.status = thread.turns.some((turn) => turn?.status === "inProgress")
    ? { activeFlags: [], type: "active" }
    : { type: "idle" };
  respond(message.id, { thread });
}

function startTurn(message) {
  const threadId = requiredString(message.params, "threadId");
  const thread = threads.get(threadId);
  if (!thread) {
    respondError(message.id, -32602, `unknown thread ${threadId}`);
    return;
  }
  turnCounter += 1;
  const turnId = `topic-turn-${turnCounter}`;
  const turn = fakeTurn(turnId, "inProgress");
  turns.set(turnId, turn);
  thread.turnIds.push(turnId);
  persistState();
  respond(message.id, { turn });
  const text = turnInputText(message.params);
  setImmediate(() => {
    if (message.params?.outputSchema) {
      emitStructuredTurn(threadId, turnId, text);
      return;
    }
    emitTurnScenario(threadId, turnId, text);
  });
}

function emitStructuredTurn(threadId, turnId, text) {
  const context = JSON.parse(text);
  if (context.kind === "input_route") {
    emitStructuredInputRoute(threadId, turnId, context);
    return;
  }
  if (context.kind === "status" && context.trigger === "explicit_status_requested") {
    emitAgentMessage(
      threadId,
      turnId,
      JSON.stringify({
        kind: "status_reply",
        sourceThroughSequence: context.sourceThroughSequence,
        statusReply:
          "The primary topic agent is still working and has not been steered or interrupted.",
      }),
    );
    completeTurn(threadId, turnId, "completed");
    return;
  }
  if (context.kind === "projection") {
    emitStructuredProjection(threadId, turnId, context);
    return;
  }
  if (context.kind === "checkpoint" && context.trigger === "checkpoint_window_exceeded") {
    emitAgentMessage(
      threadId,
      turnId,
      JSON.stringify({
        coveredThroughSequence: context.requestedRange.end,
        historicalSummary: `Observed topic history through sequence ${context.requestedRange.end}.`,
      }),
    );
    completeTurn(threadId, turnId, "completed");
    return;
  }
  completeTurn(threadId, turnId, "failed", `unsupported structured context ${context.kind}`);
}

function emitStructuredInputRoute(threadId, turnId, context) {
  const input = context.input?.input;
  const serialized = JSON.stringify(context);
  const valid = [
    typeof input?.text === "string",
    input?.modality === "voice",
    input?.hasSourcePane === true,
    context.authoritative?.conversation?.status === "idle",
    Array.isArray(context.allowedDecisionKinds),
    context.allowedDecisionKinds.includes("send_to_parent"),
    !serialized.includes("topic-thread-"),
    !serialized.includes('"providerItemId":"provider-'),
    !serialized.includes('"processId":"'),
  ].every(Boolean);
  if (!valid) {
    completeTurn(threadId, turnId, "failed", "input router context drifted");
    return;
  }
  emitAgentMessage(
    threadId,
    turnId,
    JSON.stringify({
      decision: {
        kind: "send_to_parent",
        authoredInput: input.text,
      },
    }),
  );
  completeTurn(threadId, turnId, "completed");
}

function emitStructuredProjection(threadId, turnId, context) {
  const objective = context.authoritative?.currentInstructions?.objective?.text ?? "topic work";
  if (objective.includes("narration backlog") && !failedNarratorObjectives.has(objective)) {
    failedNarratorObjectives.add(objective);
    completeTurn(threadId, turnId, "failed", "Scripted narrator outage");
    return;
  }
  const observedThroughSequence = context.evaluationRange.end;
  const output = {
    currentFocus: `Evaluated ${objective} through sequence ${observedThroughSequence}.`,
    kind: "working_projection",
    milestones: [`Narrator evaluated ${objective} through sequence ${observedThroughSequence}.`],
    observedThroughSequence,
    topicDescriptor: null,
  };
  if (context.requestedChannel === "terminal_projection") {
    output.kind = "terminal_projection";
    output.finalSummary = `Narrator completed ${objective}.`;
  }
  emitAgentMessage(threadId, turnId, JSON.stringify(output));
  completeTurn(threadId, turnId, "completed");
}

function emitTurnScenario(threadId, turnId, text) {
  emitTextDelta(threadId, turnId, `Streaming ${text}. `);
  if (text.includes("narration backlog")) {
    for (let index = 1; index <= 18; index += 1) {
      emitTextDelta(threadId, turnId, `backlog-${index.toString().padStart(2, "0")} `.repeat(600));
    }
  }
  if (text.includes("hold")) {
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
  if (text.includes("artifact")) {
    emitArtifact(threadId, turnId);
  }
  if (text.includes("fail")) {
    completeTurn(threadId, turnId, "failed", "Scripted topic failure");
    return;
  }
  emitAgentMessage(threadId, turnId, `Completed ${text}.`);
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
  setImmediate(() => {
    emitTextDelta(held.threadId, turnId, `Steered with ${text}. `);
    emitAgentMessage(held.threadId, turnId, `Steering completed ${held.text}.`);
    completeTurn(held.threadId, turnId, "completed");
  });
}

function interruptTurn(message) {
  const turnId = requiredString(message.params, "turnId");
  const held = heldTurns.get(turnId);
  if (!held) {
    const threadId = requiredString(message.params, "threadId");
    const persistedTurn = turns.get(turnId);
    const persistedThread = threads.get(threadId);
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
        options: [
          { description: "Use the focused topic.", label: "focused" },
          { description: "Use the whole workspace.", label: "workspace" },
        ],
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

function emitTextDelta(threadId, turnId, delta) {
  notify("item/agentMessage/delta", {
    delta,
    itemId: `agent-${turnId}`,
    threadId,
    turnId,
  });
}

function emitAgentMessage(threadId, turnId, text) {
  notify("item/completed", {
    completedAtMs: Date.now(),
    item: { id: `agent-${turnId}`, text, type: "agentMessage" },
    threadId,
    turnId,
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

function completeTurn(threadId, turnId, status, message = "") {
  const turn = fakeTurn(turnId, status);
  if (message !== "") {
    turn.error = { message };
  }
  turns.set(turnId, turn);
  persistState();
  notify("turn/completed", { threadId, turn });
}

function readPersistedState() {
  const empty = {
    approvalCounter: 0,
    threadCounter: 0,
    threads: [],
    turnCounter: 0,
    turns: [],
  };
  if (persistedStatePath === "" || !existsSync(persistedStatePath)) {
    return empty;
  }
  const state = JSON.parse(readFileSync(persistedStatePath, "utf8"));
  if (
    !Number.isInteger(state.approvalCounter) ||
    !Number.isInteger(state.threadCounter) ||
    !Number.isInteger(state.turnCounter) ||
    !Array.isArray(state.threads) ||
    !Array.isArray(state.turns)
  ) {
    throw new Error("fake topic Codex state is malformed");
  }
  return state;
}

function persistState() {
  if (persistedStatePath === "") {
    return;
  }
  writeFileSync(
    persistedStatePath,
    `${JSON.stringify({
      approvalCounter,
      threadCounter,
      threads: [...threads.values()],
      turnCounter,
      turns: [...turns.values()],
    })}\n`,
    "utf8",
  );
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
  const state = threads.get(threadId);
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
    approvalPolicy: state.approvalPolicy ?? "on-request",
    approvalsReviewer: "user",
    cwd: state.cwd ?? "/tmp/setta-topic-codex",
    model: state.model,
    modelProvider: "fake",
    reasoningEffort: state.reasoningEffort ?? modelReasoningEffort(state.model),
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

function notify(method, params) {
  write({ jsonrpc: "2.0", method, params });
}

function request(id, method, params) {
  write({ id, jsonrpc: "2.0", method, params });
}

function write(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}
