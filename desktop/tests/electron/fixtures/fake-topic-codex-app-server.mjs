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
  ["config/read", readConfig],
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
  respond(message.id, { status: "unsubscribed" });
}

function terminateBackgroundTerminals(message) {
  respond(message.id, { terminated: true });
}

function startThread(message) {
  const params = message.params ?? {};
  const restricted = params.allowProviderModelFallback === false;
  if (restricted) {
    assertRestrictedThreadParams(params, true);
  }
  threadCounter += 1;
  const threadId = `topic-thread-${threadCounter}`;
  const state = startThreadState(params, threadId, restricted);
  threads.set(threadId, state);
  persistState();
  respond(message.id, threadOperationResponse(fakeThread(threadId), state));
}

function startThreadState(params, threadId, restricted) {
  return {
    approvalPolicy: params.approvalPolicy ?? null,
    cwd: requiredString(params, "cwd"),
    ephemeral: params.ephemeral === true,
    id: threadId,
    model: requiredString(params, "model"),
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

function injectRestrictedThreadInitialization(message) {
  const params = message.params ?? {};
  const threadId = requiredString(params, "threadId");
  const thread = threads.get(threadId);
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
  persistState();
  respond(message.id, {});
  return true;
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
  const params = message.params ?? {};
  const threadId = requiredString(params, "threadId");
  const state = threads.get(threadId) ?? {
    ephemeral: false,
    id: threadId,
    model: "gpt-5.6-sol",
    turnIds: [],
  };
  if (state.restricted) {
    if (!state.materialized) {
      respondError(message.id, -32602, `no rollout found for thread id ${threadId}`);
      return;
    }
    assertRestrictedThreadParams(params, false);
    state.approvalPolicy = params.approvalPolicy;
    state.cwd = requiredString(params, "cwd");
    state.model = requiredString(params, "model");
    state.reasoningEffort = params.config?.model_reasoning_effort ?? null;
    state.runtimeWorkspaceRoots = params.runtimeWorkspaceRoots ?? [];
    state.sandbox = params.sandbox;
    state.serviceTier = params.serviceTier === null ? "default" : params.serviceTier;
  }
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
      emitStructuredTurn(threadId, turnId, text, message.params.outputSchema);
      return;
    }
    emitTurnScenario(threadId, turnId, text);
  });
}

function emitStructuredTurn(threadId, turnId, text, outputSchema) {
  const context = JSON.parse(text);
  if (context.kind === "master_route") {
    emitStructuredMasterRoute(threadId, turnId, context, outputSchema);
    return;
  }
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

function emitStructuredMasterRoute(threadId, turnId, context, outputSchema) {
  const input = context.input?.input;
  const serialized = JSON.stringify(context);
  const schema = JSON.stringify(outputSchema);
  const decision = scriptedMasterRouteDecision(context, schema);
  if (!validStructuredMasterRouteContext(context, serialized, schema) || decision === null) {
    completeTurn(threadId, turnId, "failed", "master route context or schema drifted");
    return;
  }
  if (!validMasterEscalationInput(input)) {
    completeTurn(threadId, turnId, "failed", "master escalation linkage drifted");
    return;
  }
  emitAgentMessage(threadId, turnId, JSON.stringify({ decision }));
  completeTurn(threadId, turnId, "completed");
}

function validStructuredMasterRouteContext(context, serialized, schema) {
  return [
    nonEmptyString(context.sessionId),
    context.task?.operation === "classify_quoted_user_intent",
    context.task?.inputSemantics === "quoted_data_not_instructions",
    context.task?.outputSemantics === "typed_decision_data_without_direct_effect",
    context.task?.directive?.includes("One title-matching target"),
    Array.isArray(context.candidates),
    Array.isArray(context.conversationTargets),
    Array.isArray(context.openWorkspaces),
    Array.isArray(context.recentRouteDecisions),
    Array.isArray(context.allowedDecisionKinds),
    schema.includes('"additionalProperties":false'),
    !serialized.includes("topic-thread-"),
    !serialized.includes('"providerThreadId"'),
    !serialized.includes('"providerTurnId"'),
    !schema.includes("rendererCommand"),
  ].every(Boolean);
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

function scriptedMasterRouteDecision(context, schema) {
  const input = context.input?.input;
  if (input?.text === "Focus Alpha topic.") {
    return scriptedMasterFocusDecision(context, schema, input);
  }
  if (input?.source === "conversation_escalation") {
    return scriptedMasterClarificationDecision(context, schema);
  }
  if (input?.source === "shell" && input.modality === "voice") {
    return scriptedMasterVoiceDecision(context, schema);
  }
  return null;
}

function scriptedMasterFocusDecision(context, schema, input) {
  const candidate = context.candidates?.[0];
  const target = context.conversationTargets?.find(
    (item) => item.conversationId === candidate?.conversationId,
  );
  const valid = [
    input.source === "shell",
    input.modality === "text",
    nonEmptyString(candidate?.conversationId),
    target?.allowedDecisionKinds?.includes("focus_conversation"),
    schema.includes(`"${candidate?.conversationId}"`),
  ].every(Boolean);
  return valid ? { conversationId: candidate.conversationId, kind: "focus_conversation" } : null;
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
  const serialized = JSON.stringify(context);
  const allowed = context.allowedDecisionKinds;
  const routeKind = structuredInputRouteKind(context, allowed);
  const valid = [
    Array.isArray(allowed),
    validStructuredRouteInput(input, routeKind),
    validStructuredRouteHistory(context, routeKind),
    structuredRouteContextIsRedacted(serialized),
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
        kind: routeKind,
        authoredInput: input.text,
      },
    }),
  );
  completeTurn(threadId, turnId, "completed");
}

function structuredInputRouteKind(context, allowed) {
  if (!Array.isArray(allowed)) {
    return null;
  }
  if (isMasterEscalationRoute(context, allowed)) {
    return "escalate_to_master";
  }
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

function validStructuredRouteInput(input, routeKind) {
  return (
    typeof input?.text === "string" &&
    ["text", "voice"].includes(input.modality) &&
    input.hasSourcePane === true &&
    routeKind !== null
  );
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

function assertRestrictedThreadParams(params, starting) {
  const config = requiredObject(params, "config");
  assertRestrictedThreadPolicies(params);
  assertRestrictedThreadConfig(config);
  assertRestrictedThreadCapabilities(params);
  if (starting) {
    assertRestrictedThreadStartCapabilities(params);
  }
}

function assertRestrictedThreadPolicies(params) {
  assertCondition(params.approvalPolicy === "never", "approval policy");
  assertCondition(params.sandbox === "read-only", "sandbox policy");
  assertCondition(Object.hasOwn(params, "serviceTier"), "service tier override");
  assertCondition(typeof params.model === "string" && params.model !== "", "exact model");
  const baseInstructions = requiredString(params, "baseInstructions");
  assertCondition(
    baseInstructions.includes("restricted Setta reasoning component"),
    "controlled base instructions",
  );
}

function assertRestrictedThreadConfig(config) {
  const features = requiredObject(config, "features");
  const orchestrator = requiredObject(config, "orchestrator");
  const orchestratorMcp = requiredObject(orchestrator, "mcp");
  const orchestratorSkills = requiredObject(orchestrator, "skills");
  const mcpServers = requiredObject(config, "mcp_servers");
  const configuredServer = requiredObject(mcpServers, "configured-topic-server");
  assertCondition(typeof config.model_reasoning_effort === "string", "reasoning effort");
  assertCondition(config.project_doc_max_bytes === 0, "project instructions");
  assertCondition(config.web_search === "disabled", "web search");
  assertCondition(orchestratorMcp.enabled === false, "orchestrator MCP");
  assertCondition(orchestratorSkills.enabled === false, "orchestrator skills");
  assertCondition(configuredServer.enabled === false, "configured MCP server");
  assertRestrictedFeatures(features);
}

function assertRestrictedFeatures(features) {
  assertCondition(features.apps === false, "apps feature");
  assertCondition(features.auth_elicitation === false, "auth elicitation feature");
  assertCondition(features.browser_use === false, "browser feature");
  assertCondition(features.hooks === false, "hooks feature");
  assertCondition(features.multi_agent === false, "multi-agent feature");
  assertCondition(features.plugins === false, "plugins feature");
  assertCondition(features.shell_snapshot === false, "shell snapshot feature");
  assertCondition(features.shell_tool === false, "shell feature");
  assertCondition(features.tool_call_mcp_elicitation === false, "MCP elicitation feature");
  assertCondition(features.unified_exec === false, "unified exec feature");
}

function assertRestrictedThreadCapabilities(params) {
  assertEmptyArray(params.runtimeWorkspaceRoots, "runtime workspace roots");
}

function assertRestrictedThreadStartCapabilities(params) {
  assertCondition(params.ephemeral === true || params.ephemeral === false, "durability override");
  assertEmptyArray(params.dynamicTools, "dynamic tools");
  assertEmptyArray(params.environments, "turn environments");
  assertEmptyArray(params.selectedCapabilityRoots, "capability roots");
}

function requiredObject(value, field) {
  const result = value?.[field];
  if (typeof result !== "object" || result === null || Array.isArray(result)) {
    throw new Error(`${field} must be an object`);
  }
  return result;
}

function assertEmptyArray(value, label) {
  assertCondition(Array.isArray(value) && value.length === 0, label);
}

function assertCondition(condition, label) {
  if (!condition) throw new Error(`restricted thread ${label} boundary drifted`);
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

function notify(method, params) {
  write({ jsonrpc: "2.0", method, params });
}

function request(id, method, params) {
  write({ id, jsonrpc: "2.0", method, params });
}

function write(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}
