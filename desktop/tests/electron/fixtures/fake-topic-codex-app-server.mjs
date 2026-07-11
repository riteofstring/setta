import process from "node:process";
import readline from "node:readline";
import { setImmediate } from "node:timers";

let threadCounter = 0;
let turnCounter = 0;
let approvalCounter = 0;
const threads = new Map();
const turns = new Map();
const heldTurns = new Map();
const pendingApprovals = new Map();
const methodHandlers = new Map([
  ["initialize", initialize],
  ["initialized", () => {}],
  ["model/list", listModels],
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
    data: [fakeModel("gpt-5.6-sol", "high", true)],
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
  threadCounter += 1;
  const threadId = `topic-thread-${threadCounter}`;
  threads.set(threadId, { id: threadId, turnIds: [] });
  respond(message.id, threadOperationResponse(fakeThread(threadId)));
}

function resumeThread(message) {
  const threadId = requiredString(message.params, "threadId");
  threads.set(threadId, threads.get(threadId) ?? { id: threadId, turnIds: [] });
  respond(message.id, threadOperationResponse(fakeThread(threadId)));
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
  respond(message.id, { turn });
  const text = turnInputText(message.params);
  setImmediate(() => emitTurnScenario(threadId, turnId, text));
}

function emitTurnScenario(threadId, turnId, text) {
  emitTextDelta(threadId, turnId, `Streaming ${text}. `);
  if (text.includes("hold")) {
    heldTurns.set(turnId, { threadId, text });
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
    respondError(message.id, -32602, `turn ${turnId} is not interruptible`);
    return;
  }
  heldTurns.delete(turnId);
  respond(message.id, {});
  setImmediate(() => completeTurn(held.threadId, turnId, "interrupted"));
}

function requestApproval(threadId, turnId) {
  approvalCounter += 1;
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
  setImmediate(() => {
    emitAgentMessage(pending.threadId, pending.turnId, "Approval answered and work completed.");
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
  notify("turn/completed", { threadId, turn });
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
  return {
    cliVersion: "fake",
    createdAt: 1,
    cwd: "/tmp/setta-topic-codex",
    ephemeral: false,
    id: threadId,
    modelProvider: "fake",
    path: `/tmp/setta-topic-codex/${threadId}.jsonl`,
    preview: "",
    sessionId: `session-${threadId}`,
    source: "user",
    status: { type: "idle" },
    turns: [],
    updatedAt: 1,
  };
}

function threadOperationResponse(thread) {
  return {
    approvalPolicy: "on-request",
    approvalsReviewer: "user",
    cwd: "/tmp/setta-topic-codex",
    model: "gpt-5.6-sol",
    modelProvider: "fake",
    reasoningEffort: "high",
    sandbox: "workspace-write",
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

function notify(method, params) {
  write({ jsonrpc: "2.0", method, params });
}

function request(id, method, params) {
  write({ id, jsonrpc: "2.0", method, params });
}

function write(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}
