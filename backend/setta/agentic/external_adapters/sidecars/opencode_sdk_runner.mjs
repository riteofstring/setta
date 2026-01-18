import readline from "node:readline";
import { randomUUID } from "node:crypto";
import { createOpencode, createOpencodeClient } from "@opencode-ai/sdk";

function writeEvent(event) {
  process.stdout.write(`${JSON.stringify(event)}\n`);
}

function parseJsonLine(raw) {
  try {
    return JSON.parse(raw);
  } catch (err) {
    writeEvent({
      type: "error",
      message: `Failed to parse input JSON: ${
        err instanceof Error ? err.message : String(err)
      }`,
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

function extractSessionId(payload) {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const candidates = [
    payload.id,
    payload.sessionId,
    payload.session_id,
    payload?.data?.id,
    payload?.data?.sessionId,
    payload?.session?.id,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate;
    }
  }
  return null;
}

function extractPermissionPayload(event) {
  if (!event || typeof event !== "object") {
    return null;
  }
  if (event.permission && typeof event.permission === "object") {
    return event.permission;
  }
  if (event.properties && typeof event.properties === "object") {
    if (
      event.properties.permission &&
      typeof event.properties.permission === "object"
    ) {
      return event.properties.permission;
    }
  }
  return null;
}

function extractPermissionId(event, permission) {
  const candidates = [
    event.permissionId,
    event.permissionID,
    event.permission_id,
    event.id,
    permission?.id,
    permission?.permissionId,
    permission?.permissionID,
    permission?.permission_id,
    event?.properties?.permissionId,
    event?.properties?.permissionID,
    event?.properties?.permission_id,
    event?.properties?.id,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate;
    }
  }
  return null;
}

function isPermissionRequest(event, permission) {
  const typeValue = normalizeString(event?.type).toLowerCase();
  const hasPermissionType = typeValue.includes("permission");
  if (!hasPermissionType && !permission) {
    return false;
  }
  const response =
    permission?.response ?? permission?.decision ?? event?.response ?? event?.decision;
  if (typeof response === "string" && response.trim()) {
    return false;
  }
  if (response === true || response === false) {
    return false;
  }
  const statusValue = normalizeString(
    permission?.status ?? permission?.state ?? event?.status ?? event?.state,
  ).toLowerCase();
  if (
    statusValue &&
    ["request", "pending", "await", "ask"].some((token) =>
      statusValue.includes(token),
    )
  ) {
    return true;
  }
  if (typeValue.includes("request")) {
    return true;
  }
  return hasPermissionType;
}

function extractToolDetails(event, permission) {
  const tool =
    permission?.tool ??
    permission?.command ??
    permission?.action ??
    permission?.name ??
    event?.tool ??
    event?.command ??
    null;
  const input =
    permission?.input ??
    permission?.args ??
    permission?.payload ??
    permission?.request ??
    event?.input ??
    event?.args ??
    permission ??
    null;
  const toolName =
    permission?.toolName ??
    permission?.name ??
    permission?.tool?.name ??
    event?.toolName ??
    null;
  const toolType =
    permission?.toolType ??
    permission?.type ??
    permission?.tool?.type ??
    event?.toolType ??
    event?.type ??
    null;
  return { tool, input, toolName, toolType };
}

const rl = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});

let resolveStartPayload;
const startPayloadPromise = new Promise((resolve) => {
  resolveStartPayload = resolve;
});

const pendingApprovals = new Map();

function resolveApproval(payload) {
  const approvalId =
    typeof payload.approvalId === "string"
      ? payload.approvalId
      : typeof payload.approval_id === "string"
        ? payload.approval_id
        : typeof payload.id === "string"
          ? payload.id
          : null;
  if (!approvalId) {
    return;
  }
  let approved = null;
  if (typeof payload.approved === "boolean") {
    approved = payload.approved;
  }
  if (typeof payload.decision === "string") {
    const normalized = payload.decision.toLowerCase();
    if (["allow", "approve", "approved", "yes", "y", "true"].includes(normalized)) {
      approved = true;
    } else if (["deny", "denied", "no", "n", "false"].includes(normalized)) {
      approved = false;
    }
  }
  if (approved === null) {
    approved = false;
  }
  const resolver = pendingApprovals.get(approvalId);
  if (resolver) {
    resolver(Boolean(approved));
    pendingApprovals.delete(approvalId);
  }
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
    resolveApproval(payload);
    return;
  }
  if (payload.type === "start" || payload.prompt) {
    resolveStartPayload(payload);
  }
});

process.on("unhandledRejection", (err) => {
  writeEvent({
    type: "error",
    message: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});

const input = await startPayloadPromise;
if (!input) {
  process.exit(0);
}

const prompt = typeof input.prompt === "string" ? input.prompt : "";
const baseUrl = typeof input.baseUrl === "string" ? input.baseUrl : null;
const workingDir =
  typeof input.workingDir === "string" ? input.workingDir : process.cwd();
const model = typeof input.model === "string" ? input.model : undefined;
const requestedSessionId =
  typeof input.sessionId === "string" ? input.sessionId : null;
const runId = typeof input.runId === "string" ? input.runId : null;

let client;
let serverHandle = null;
let resolvedBaseUrl = baseUrl;
if (baseUrl) {
  client = createOpencodeClient({ baseUrl });
} else {
  const opencode = await createOpencode({ cwd: workingDir });
  client = opencode.client ?? opencode;
  serverHandle = opencode.server ?? opencode.process ?? null;
  resolvedBaseUrl =
    opencode.baseUrl ??
    opencode?.server?.url ??
    opencode?.server?.baseUrl ??
    client?.baseUrl ??
    client?.config?.baseUrl ??
    resolvedBaseUrl;
}

let sessionId = requestedSessionId;
if (!sessionId) {
  const created = await client.session.create({
    body: { title: "Setta external run" },
  });
  sessionId = extractSessionId(created);
}

if (!sessionId) {
  writeEvent({
    type: "error",
    message: "Failed to create or resolve OpenCode session id.",
  });
  process.exit(1);
}

async function sendPermissionResponse(permissionId, approved) {
  const response = approved ? "once" : "reject";
  const body = { response, remember: false };
  const path = { id: sessionId, permissionID: permissionId };
  const permissionApi = client?.session?.permissions ?? client?.session?.permission;
  if (permissionApi) {
    const candidates = ["reply", "respond", "update"];
    for (const name of candidates) {
      const fn = permissionApi[name];
      if (typeof fn === "function") {
        await fn({ path, body });
        return;
      }
    }
  }
  if (!resolvedBaseUrl) {
    throw new Error("OpenCode baseUrl unavailable for permission response");
  }
  const normalizedBase = resolvedBaseUrl.replace(/\/+$/, "");
  const url = `${normalizedBase}/session/${encodeURIComponent(
    sessionId,
  )}/permissions/${encodeURIComponent(permissionId)}`;
  const result = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!result.ok) {
    throw new Error(
      `OpenCode permission response failed (${result.status} ${result.statusText})`,
    );
  }
}

async function maybeHandlePermissionEvent(event) {
  const permission = extractPermissionPayload(event);
  if (!permission || !isPermissionRequest(event, permission)) {
    return false;
  }
  const permissionId = extractPermissionId(event, permission);
  if (!permissionId) {
    return false;
  }
  const approvalId = permissionId || randomUUID();
  const { tool, input: toolInput, toolName, toolType } = extractToolDetails(
    event,
    permission,
  );
  writeEvent({
    type: "approval_request",
    approvalId,
    runId,
    tool,
    input: toolInput,
    toolName,
    toolType,
    sessionId,
    permissionId,
  });
  const approved = await new Promise((resolve) => {
    pendingApprovals.set(approvalId, resolve);
  });
  try {
    await sendPermissionResponse(permissionId, approved);
  } catch (err) {
    writeEvent({
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    });
  }
  return true;
}

if (typeof client.session.promptStream === "function") {
  for await (const event of client.session.promptStream({
    path: { id: sessionId },
    body: {
      parts: [{ type: "text", text: prompt }],
      model,
    },
  })) {
    if (await maybeHandlePermissionEvent(event)) {
      continue;
    }
    writeEvent(event);
  }
} else {
  const response = await client.session.prompt({
    path: { id: sessionId },
    body: {
      parts: [{ type: "text", text: prompt }],
      model,
    },
  });
  writeEvent({
    type: "assistant_message",
    sessionId,
    message: response,
  });
}

if (serverHandle && typeof serverHandle.stop === "function") {
  await serverHandle.stop();
} else if (serverHandle && typeof serverHandle.close === "function") {
  await serverHandle.close();
}
