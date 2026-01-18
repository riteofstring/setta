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

let resolveStartPayload;
let startPayloadResolved = false;
const startPayloadPromise = new Promise((resolve) => {
  resolveStartPayload = resolve;
});

const pendingApprovals = new Map();

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
  if (!startPayloadResolved && (payload.type === "start" || payload.prompt)) {
    startPayloadResolved = true;
    resolveStartPayload(payload);
  }
});

const input = await startPayloadPromise;
if (!input) {
  process.exit(0);
}

const prompt = typeof input.prompt === "string" ? input.prompt : "";
const threadId = typeof input.threadId === "string" ? input.threadId : null;
const itemId = typeof input.itemId === "string" ? input.itemId : `item_${Date.now()}`;

const codex = new Codex();
const thread = threadId ? codex.resumeThread(threadId) : codex.startThread();
const resolvedThreadId = extractThreadId(thread);
if (resolvedThreadId) {
  writeEvent({ type: "thread.started", thread_id: resolvedThreadId });
}

writeEvent({ type: "turn.started" });
if (typeof thread.runStreamed === "function") {
  for await (const event of thread.runStreamed(prompt)) {
    const approvalRequest = maybeHandleApprovalRequest(event, thread);
    if (approvalRequest) {
      const responder =
        approvalRequest.responder ||
        ((approved) => {
          writeEvent({
            type: "error",
            message: `Codex SDK approval ${approvalRequest.approvalId} has no responder; decision=${approved}`,
          });
        });
      pendingApprovals.set(approvalRequest.approvalId, responder);
      writeEvent(approvalRequest.payload);
      continue;
    }
    writeEvent(event);
  }
} else {
  const result = await thread.run(prompt);
  const text = extractText(result);
  writeEvent({
    type: "item.started",
    item: { id: itemId, type: "agent_message" },
  });
  writeEvent({
    type: "item.completed",
    item: { id: itemId, type: "agent_message", text },
  });
}
writeEvent({ type: "turn.completed" });
