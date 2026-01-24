import readline from "node:readline";
import { Codex } from "@openai/codex-sdk";

function writeEvent(event) {
  process.stdout.write(`${JSON.stringify(event)}\n`);
}

function parseJsonLine(raw) {
  try {
    return JSON.parse(raw);
  } catch (err) {
    writeEvent({
      type: "error",
      message: `Failed to parse input JSON: ${err instanceof Error ? err.message : String(err)}`,
    });
    return null;
  }
}

function normalizeString(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function normalizeThreadOptions(value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  const options = {};
  if (typeof value.skipGitRepoCheck === "boolean") {
    options.skipGitRepoCheck = value.skipGitRepoCheck;
  }
  if (Object.keys(options).length === 0) {
    return null;
  }
  return options;
}

function extractText(result) {
  if (typeof result === "string") {
    return result;
  }
  if (result && typeof result === "object") {
    const candidates = [result.text, result.message, result.output, result.response];
    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.trim()) {
        return candidate;
      }
    }
    if (Array.isArray(result.content)) {
      const parts = [];
      for (const block of result.content) {
        if (block && typeof block === "object") {
          const text = block.text || block.delta;
          if (typeof text === "string" && text.trim()) {
            parts.push(text);
          }
        } else if (typeof block === "string") {
          parts.push(block);
        }
      }
      if (parts.length > 0) {
        return parts.join("");
      }
    }
  }
  try {
    return JSON.stringify(result);
  } catch {
    return String(result ?? "");
  }
}

function extractThreadId(thread) {
  if (!thread || typeof thread !== "object") {
    return null;
  }
  const candidates = [thread.id, thread.threadId, thread._id];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate;
    }
  }
  return null;
}

function extractApprovalId(event, approval) {
  const candidates = [
    event?.approvalId,
    event?.approval_id,
    event?.permissionId,
    event?.permission_id,
    event?.id,
    event?.item?.id,
    approval?.id,
    approval?.approvalId,
    approval?.approval_id,
    approval?.permissionId,
    approval?.permission_id,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate;
    }
  }
  return null;
}

function extractApprovalDecision(payload) {
  if (typeof payload.approved === "boolean") {
    return payload.approved;
  }
  const decision = normalizeString(payload.decision).toLowerCase();
  if (["allow", "approve", "approved", "yes", "y", "true"].includes(decision)) {
    return true;
  }
  if (["deny", "denied", "no", "n", "false"].includes(decision)) {
    return false;
  }
  return false;
}

function extractApprovalContainer(event) {
  if (!event || typeof event !== "object") {
    return null;
  }
  if (event.approval && typeof event.approval === "object") {
    return event.approval;
  }
  if (event.permission && typeof event.permission === "object") {
    return event.permission;
  }
  if (event.request && typeof event.request === "object") {
    return event.request;
  }
  if (
    event.details &&
    typeof event.details === "object" &&
    event.details.approval &&
    typeof event.details.approval === "object"
  ) {
    return event.details.approval;
  }
  return null;
}

function extractToolDetails(event, approval) {
  const tool =
    approval?.tool ??
    approval?.command ??
    approval?.action ??
    event?.tool ??
    event?.command ??
    event?.action ??
    null;
  const input =
    approval?.input ??
    approval?.args ??
    approval?.payload ??
    approval?.request ??
    event?.input ??
    event?.args ??
    approval ??
    null;
  const toolName =
    approval?.toolName ??
    approval?.name ??
    approval?.tool?.name ??
    event?.toolName ??
    null;
  const toolType =
    approval?.toolType ??
    approval?.type ??
    approval?.tool?.type ??
    event?.toolType ??
    event?.type ??
    null;
  return { tool, input, toolName, toolType };
}

function buildApprovalResponder(event, approval, thread, approvalId) {
  const candidates = [approval, event];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") {
      continue;
    }
    if (typeof candidate.respond === "function") {
      return (approved) => candidate.respond(approved);
    }
    if (typeof candidate.resolve === "function") {
      return (approved) => candidate.resolve(approved);
    }
    if (typeof candidate.approve === "function" && typeof candidate.deny === "function") {
      return (approved) => (approved ? candidate.approve() : candidate.deny());
    }
    if (typeof candidate.approve === "function") {
      return (approved) => candidate.approve(approved);
    }
  }
  if (thread && typeof thread === "object") {
    if (typeof thread.respondApproval === "function") {
      return (approved) => thread.respondApproval(approvalId, approved);
    }
    if (typeof thread.approve === "function") {
      return (approved) => thread.approve(approvalId, approved);
    }
    if (typeof thread.sendApproval === "function") {
      return (approved) => thread.sendApproval(approvalId, approved);
    }
  }
  return null;
}

function maybeHandleApprovalRequest(event, thread) {
  if (!event || typeof event !== "object") {
    return null;
  }
  const typeValue = normalizeString(event.type).toLowerCase();
  const approval = extractApprovalContainer(event);
  if (!approval && !typeValue.includes("approval") && !typeValue.includes("permission")) {
    return null;
  }
  const approvalId = extractApprovalId(event, approval);
  if (!approvalId) {
    return null;
  }
  const { tool, input, toolName, toolType } = extractToolDetails(event, approval);
  const responder = buildApprovalResponder(event, approval, thread, approvalId);
  return {
    approvalId,
    responder,
    payload: {
      type: "approval_request",
      approvalId,
      tool,
      input,
      toolName,
      toolType,
    },
  };
}

process.on("unhandledRejection", (err) => {
  writeEvent({
    type: "error",
    message: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});

const rl = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});

const pendingApprovals = new Map();
const inputQueue = [];
let resolveNextInput = null;
let stdinClosed = false;

function enqueueInput(payload) {
  if (resolveNextInput) {
    resolveNextInput(payload);
    resolveNextInput = null;
    return;
  }
  inputQueue.push(payload);
}

async function nextInput() {
  if (inputQueue.length > 0) {
    return inputQueue.shift();
  }
  if (stdinClosed) {
    return null;
  }
  return new Promise((resolve) => {
    resolveNextInput = resolve;
  });
}

function resolveApprovalResponse(payload) {
  const approvalId = extractApprovalId(payload, payload);
  if (!approvalId) {
    return;
  }
  const approved = extractApprovalDecision(payload);
  const responder = pendingApprovals.get(approvalId);
  if (!responder) {
    writeEvent({
      type: "error",
      message: `No pending approval found for ${approvalId}`,
    });
    return;
  }
  pendingApprovals.delete(approvalId);
  Promise.resolve()
    .then(() => responder(approved))
    .catch((err) => {
      writeEvent({
        type: "error",
        message: `Failed to respond to approval ${approvalId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      });
    });
}

rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) {
    return;
  }
  const payload = parseJsonLine(trimmed);
  if (!payload || typeof payload !== "object") {
    return;
  }
  if (payload.type === "approval_response") {
    resolveApprovalResponse(payload);
    return;
  }
  if (payload.type === "start" || payload.prompt) {
    enqueueInput(payload);
  }
});
rl.on("close", () => {
  stdinClosed = true;
  if (resolveNextInput) {
    resolveNextInput(null);
    resolveNextInput = null;
  }
});

const codex = new Codex();
let thread = null;
let activeThreadId = null;

async function runTurn(input) {
  const prompt = typeof input.prompt === "string" ? input.prompt : "";
  const runId =
    typeof input.runId === "string"
      ? input.runId
      : typeof input.itemId === "string"
        ? input.itemId
        : `run_${Date.now()}`;
  const desiredThreadId = typeof input.threadId === "string" ? input.threadId : null;
  const threadOptions = normalizeThreadOptions(input.threadOptions);
  if (!thread || (desiredThreadId && desiredThreadId !== activeThreadId)) {
    if (desiredThreadId) {
      thread = codex.resumeThread(desiredThreadId);
    } else if (threadOptions) {
      thread = codex.startThread(threadOptions);
    } else {
      thread = codex.startThread();
    }
    activeThreadId = extractThreadId(thread);
    if (activeThreadId) {
      writeEvent({
        type: "thread.started",
        thread_id: activeThreadId,
        settaRunId: runId,
      });
    }
  }

  writeEvent({ type: "turn.started", settaRunId: runId });
  try {
    if (typeof thread.runStreamed === "function") {
      const streamResult = await Promise.resolve(thread.runStreamed(prompt));
      const events = streamResult?.events ?? streamResult;
      if (!events || typeof events[Symbol.asyncIterator] !== "function") {
        throw new Error("Codex SDK runStreamed() did not return an async iterable");
      }
      for await (const event of events) {
        const approvalRequest = maybeHandleApprovalRequest(event, thread);
        if (approvalRequest) {
          const responder =
            approvalRequest.responder ||
            ((approved) => {
              writeEvent({
                type: "error",
                message: `Codex SDK approval ${approvalRequest.approvalId} has no responder; decision=${approved}`,
                settaRunId: runId,
              });
            });
          pendingApprovals.set(approvalRequest.approvalId, responder);
          writeEvent({ ...approvalRequest.payload, settaRunId: runId });
          continue;
        }
        writeEvent({ ...event, settaRunId: runId });
      }
    } else {
      const result = await thread.run(prompt);
      const text = extractText(result);
      writeEvent({
        type: "item.started",
        item: { id: runId, type: "agent_message" },
        settaRunId: runId,
      });
      writeEvent({
        type: "item.completed",
        item: { id: runId, type: "agent_message", text },
        settaRunId: runId,
      });
    }
    writeEvent({ type: "turn.completed", settaRunId: runId });
  } catch (err) {
    writeEvent({
      type: "turn.failed",
      error: { message: err instanceof Error ? err.message : String(err) },
      settaRunId: runId,
    });
  }
}

while (true) {
  const input = await nextInput();
  if (!input) {
    break;
  }
  await runTurn(input);
}
