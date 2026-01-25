import readline from "node:readline";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { createOpencode, createOpencodeClient } from "@opencode-ai/sdk";
import { createQuestionIdMapper } from "./opencode_question_map.mjs";
import { buildQuestionReplyBodies } from "./opencode_question_reply.mjs";

function writeEvent(event) {
  process.stdout.write(`${JSON.stringify(event)}\n`);
}

const DEBUG = process.env.SETTA_OPENCODE_DEBUG === "1";
const DEBUG_RAW = process.env.SETTA_OPENCODE_DEBUG_RAW === "1";

function logDebug(message, extra) {
  if (!DEBUG) {
    return;
  }
  const timestamp = new Date().toISOString();
  if (extra !== undefined) {
    process.stderr.write(
      `[${timestamp}] [opencode] ${message} ${JSON.stringify(extra)}\n`,
    );
    return;
  }
  process.stderr.write(`[${timestamp}] [opencode] ${message}\n`);
}

const { recordQuestionMapping, resolveQuestionId, resolveQuestionOrder } =
  createQuestionIdMapper({ logDebug });

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
    payload.sessionId,
    payload.sessionID,
    payload.session_id,
    payload.id,
    payload?.data?.id,
    payload?.data?.sessionId,
    payload?.data?.sessionID,
    payload?.session?.id,
    payload?.session?.sessionId,
    payload?.session?.sessionID,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate;
    }
  }
  return null;
}

function extractSessionIdFromEvent(event) {
  if (!event || typeof event !== "object") {
    return null;
  }
  const direct = extractSessionId(event);
  if (direct) {
    return direct;
  }
  const properties =
    event.properties && typeof event.properties === "object" ? event.properties : null;
  if (!properties) {
    return null;
  }
  const candidates = [
    extractSessionId(properties),
    extractSessionId(properties?.info),
    extractSessionId(properties?.part),
    extractSessionId(properties?.permission),
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
    if (event.type && String(event.type).startsWith("permission")) {
      return event.properties;
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
  if (typeValue.includes("request") || typeValue.endsWith("permission.updated")) {
    return true;
  }
  return hasPermissionType;
}

function parseModel(value) {
  if (!value) {
    return undefined;
  }
  if (typeof value === "object") {
    if (
      typeof value.providerID === "string" &&
      typeof value.modelID === "string"
    ) {
      return value;
    }
    return undefined;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  if (trimmed.includes("/")) {
    const [providerID, ...rest] = trimmed.split("/");
    const modelID = rest.join("/");
    if (providerID && modelID) {
      return { providerID, modelID };
    }
  }
  return undefined;
}

function isSessionIdleEvent(event, sessionId) {
  if (!sessionId) {
    return false;
  }
  const typeValue = normalizeString(event?.type).toLowerCase();
  if (!typeValue) {
    return false;
  }
  if (typeValue === "session.idle") {
    return extractSessionIdFromEvent(event) === sessionId;
  }
  if (typeValue === "session.status") {
    const status =
      event?.properties && typeof event.properties === "object"
        ? event.properties.status
        : null;
    if (!status || typeof status !== "object") {
      return false;
    }
    if (normalizeString(status.type).toLowerCase() !== "idle") {
      return false;
    }
    return extractSessionIdFromEvent(event) === sessionId;
  }
  return false;
}

function isAssistantMessageCompleted(event, sessionId) {
  if (!event || typeof event !== "object") {
    return false;
  }
  if (normalizeString(event.type).toLowerCase() !== "message.updated") {
    return false;
  }
  const properties =
    event.properties && typeof event.properties === "object" ? event.properties : null;
  if (!properties) {
    return false;
  }
  const info =
    properties.info && typeof properties.info === "object" ? properties.info : null;
  if (!info) {
    return false;
  }
  if (info.role !== "assistant") {
    return false;
  }
  const time = info.time && typeof info.time === "object" ? info.time : null;
  if (!time || !time.completed) {
    return false;
  }
  const finish = normalizeString(info.finish).toLowerCase();
  if (finish && finish.includes("tool")) {
    return false;
  }
  const eventSessionId = extractSessionIdFromEvent(event);
  if (eventSessionId && sessionId && eventSessionId !== sessionId) {
    return false;
  }
  return true;
}

function readConfigFile(configPath) {
  if (!configPath || typeof configPath !== "string") {
    return null;
  }
  try {
    const raw = fs.readFileSync(configPath, "utf8");
    if (!raw.trim()) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return parsed;
    }
  } catch (err) {
    writeEvent({
      type: "error",
      message: `Failed to read OpenCode config at ${configPath}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    });
  }
  return null;
}

function summarizeConfig(config) {
  if (!config || typeof config !== "object") {
    return null;
  }
  const mcp = config.mcp && typeof config.mcp === "object" ? config.mcp : {};
  const mcpKeys = Object.keys(mcp);
  const mcpSummary = mcpKeys.map((key) => {
    const entry = mcp[key];
    if (!entry || typeof entry !== "object") {
      return key;
    }
    return {
      id: key,
      type: entry.type,
      enabled: entry.enabled,
      url: entry.url,
      hasHeaders: Boolean(entry.headers),
    };
  });
  const permissionKeys =
    config.permission && typeof config.permission === "object"
      ? Object.keys(config.permission)
      : [];
  return {
    model: config.model,
    logLevel: config.logLevel,
    mcpKeys,
    mcp: mcpSummary,
    permissionKeys,
  };
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
const assistantMessageIds = new Set();
let sawAssistantEvent = false;
let sawAssistantContent = false;
let sawError = false;
let errorMessage = null;

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

function extractQuestionId(payload) {
  return resolveQuestionId(payload);
}

async function sendQuestionResponse(requestId, rawAnswers, questionOrder) {
  const bodies = buildQuestionReplyBodies(rawAnswers, questionOrder);
  const path = {
    id: requestId,
    requestID: requestId,
    requestId: requestId,
    questionId: requestId,
  };
  if (client?.question && typeof client.question.reply === "function") {
    let lastError = null;
    for (const body of bodies) {
      try {
        await client.question.reply({
          path,
          body,
          query: workingDir ? { directory: workingDir } : undefined,
        });
        return;
      } catch (err) {
        lastError = err;
        const message = err instanceof Error ? err.message : String(err);
        if (!message.includes("400") && !message.toLowerCase().includes("bad request")) {
          throw err;
        }
      }
    }
    if (lastError) {
      throw lastError;
    }
  }
  if (typeof client?.postQuestionByIdReply === "function") {
    let lastError = null;
    for (const body of bodies) {
      try {
        await client.postQuestionByIdReply({
          path,
          body,
          query: workingDir ? { directory: workingDir } : undefined,
        });
        return;
      } catch (err) {
        lastError = err;
        const message = err instanceof Error ? err.message : String(err);
        if (!message.includes("400") && !message.toLowerCase().includes("bad request")) {
          throw err;
        }
      }
    }
    if (lastError) {
      throw lastError;
    }
  }
  if (typeof client?.postQuestionByRequestIdReply === "function") {
    let lastError = null;
    for (const body of bodies) {
      try {
        await client.postQuestionByRequestIdReply({
          path,
          body,
          query: workingDir ? { directory: workingDir } : undefined,
        });
        return;
      } catch (err) {
        lastError = err;
        const message = err instanceof Error ? err.message : String(err);
        if (!message.includes("400") && !message.toLowerCase().includes("bad request")) {
          throw err;
        }
      }
    }
    if (lastError) {
      throw lastError;
    }
  }
  if (typeof client?.postQuestionByQuestionIdReply === "function") {
    let lastError = null;
    for (const body of bodies) {
      try {
        await client.postQuestionByQuestionIdReply({
          path,
          body,
          query: workingDir ? { directory: workingDir } : undefined,
        });
        return;
      } catch (err) {
        lastError = err;
        const message = err instanceof Error ? err.message : String(err);
        if (!message.includes("400") && !message.toLowerCase().includes("bad request")) {
          throw err;
        }
      }
    }
    if (lastError) {
      throw lastError;
    }
  }
  if (!resolvedBaseUrl) {
    throw new Error("OpenCode baseUrl unavailable for question response");
  }
  const normalizedBase = resolvedBaseUrl.replace(/\/+$/, "");
  const url = new URL(
    `${normalizedBase}/question/${encodeURIComponent(requestId)}/reply`,
  );
  if (workingDir) {
    url.searchParams.set("directory", workingDir);
  }
  let lastError = null;
  for (const body of bodies) {
    const result = await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (result.ok) {
      return;
    }
    let errorDetail = "";
    try {
      errorDetail = (await result.text()).trim();
    } catch {
      errorDetail = "";
    }
    lastError = new Error(
      `OpenCode question response failed (${result.status} ${result.statusText})${
        errorDetail ? `: ${errorDetail}` : ""
      }`,
    );
    if (result.status !== 400) {
      break;
    }
  }
  if (lastError) {
    throw lastError;
  }
}

async function handleQuestionResponse(payload) {
  const questionId = extractQuestionId(payload);
  if (!questionId) {
    logDebug("question response missing id", payload);
    return;
  }
  const rawAnswers =
    payload.answers ?? payload.answer ?? payload.response ?? payload.responses ?? null;
  const questionOrder = resolveQuestionOrder(payload);
  try {
    logDebug("sending question response", {
      questionId,
      hasAnswers: rawAnswers != null,
    });
    await sendQuestionResponse(questionId, rawAnswers, questionOrder);
    logDebug("question response sent", { questionId });
  } catch (err) {
    writeEvent({
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    });
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
  if (payload.type === "question_response") {
    void handleQuestionResponse(payload);
    return;
  }
  if (payload.type === "start" || payload.prompt) {
    resolveStartPayload(payload);
  }
});

process.on("unhandledRejection", (err) => {
  const message = err instanceof Error ? err.message : String(err);
  writeEvent({
    type: "error",
    message,
  });
  sawError = true;
  errorMessage = message;
  process.exitCode = 1;
});

const input = await startPayloadPromise;
if (!input) {
  process.exit(0);
}

const prompt = typeof input.prompt === "string" ? input.prompt : "";
const systemPrompt =
  typeof input.systemPrompt === "string" ? input.systemPrompt.trim() : "";
const baseUrl = typeof input.baseUrl === "string" ? input.baseUrl : null;
const workingDir =
  typeof input.workingDir === "string" ? input.workingDir : process.cwd();
const model = parseModel(input.model);
const requestedSessionId =
  typeof input.sessionId === "string" ? input.sessionId : null;
const runId = typeof input.runId === "string" ? input.runId : null;
const requestedHostname =
  typeof input.hostname === "string" && input.hostname.trim()
    ? input.hostname.trim()
    : null;
let requestedPort = null;
if (typeof input.port === "number" && Number.isFinite(input.port)) {
  requestedPort = Math.trunc(input.port);
} else if (typeof input.port === "string" && input.port.trim()) {
  const parsed = Number(input.port);
  if (Number.isFinite(parsed)) {
    requestedPort = Math.trunc(parsed);
  }
}

logDebug("start payload", {
  runId,
  baseUrl,
  hostname: requestedHostname,
  port: requestedPort,
  workingDir,
  model,
  promptLength: prompt.length,
  systemPromptLength: systemPrompt.length,
  hasSessionId: Boolean(requestedSessionId),
});

let client;
let serverHandle = null;
let resolvedBaseUrl = baseUrl;
if (baseUrl) {
  client = createOpencodeClient({ baseUrl });
  logDebug("using existing opencode server", { baseUrl });
} else {
  const createOptions = {};
  let config = null;
  const envConfigPath = process.env.OPENCODE_CONFIG;
  if (envConfigPath) {
    config = readConfigFile(envConfigPath);
    logDebug("loaded config from OPENCODE_CONFIG", {
      path: envConfigPath,
      summary: summarizeConfig(config),
    });
  }
  if (!config) {
    config = readConfigFile(`${workingDir}/opencode.json`);
    if (config) {
      logDebug("loaded config from working dir", {
        path: `${workingDir}/opencode.json`,
        summary: summarizeConfig(config),
      });
    }
  }
  if (config) {
    createOptions.config = config;
  }
  if (requestedHostname) {
    createOptions.hostname = requestedHostname;
  }
  if (requestedPort !== null) {
    createOptions.port = requestedPort;
  }
  const opencode =
    Object.keys(createOptions).length > 0
      ? await createOpencode(createOptions)
      : await createOpencode();
  client = opencode.client ?? opencode;
  serverHandle = opencode.server ?? opencode.process ?? null;
  resolvedBaseUrl =
    opencode.baseUrl ??
    opencode?.server?.url ??
    opencode?.server?.baseUrl ??
    client?.baseUrl ??
    client?.config?.baseUrl ??
    resolvedBaseUrl;
  logDebug("spawned opencode server", {
    baseUrl: resolvedBaseUrl,
    hasServerHandle: Boolean(serverHandle),
  });
}

let sessionId = requestedSessionId;
if (!sessionId) {
  const created = await client.session.create({
    body: { title: "Setta external run" },
    query: { directory: workingDir },
  });
  sessionId = extractSessionId(created);
  logDebug("created session", { sessionId });
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
  const body = { response };
  const path = { id: sessionId, permissionID: permissionId };
  const options = { path, body, query: { directory: workingDir } };
  if (typeof client?.postSessionIdPermissionsPermissionId === "function") {
    logDebug("sending permission response", { permissionId, response });
    await client.postSessionIdPermissionsPermissionId(options);
    logDebug("permission response sent", { permissionId });
    return;
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
  logDebug("permission request", {
    approvalId,
    permissionId,
    tool,
    toolName,
    toolType,
  });
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

const eventsController = new AbortController();
const events = await client.event.subscribe({
  signal: eventsController.signal,
});
const abortEvents = () => {
  if (!eventsController.signal.aborted) {
    eventsController.abort();
  }
};
const promptPayload = {
  path: { id: sessionId },
  query: { directory: workingDir },
  body: {
    parts: [{ type: "text", text: prompt }],
  },
};
if (systemPrompt) {
  promptPayload.body.system = systemPrompt;
}
if (model) {
  promptPayload.body.model = model;
}
logDebug("sending prompt", {
  sessionId,
  hasSystem: Boolean(systemPrompt),
  model,
  parts: promptPayload.body.parts.length,
});
let promptResult = null;
let promptError = null;
let promptDone = false;
const promptPromise = client.session
  .prompt(promptPayload)
  .then((result) => {
    if (result && typeof result === "object" && "error" in result && result.error) {
      promptError = result.error;
      promptDone = true;
      return null;
    }
    if (result && typeof result === "object" && "data" in result) {
      promptResult = result.data;
    } else {
      promptResult = result;
    }
    promptDone = true;
    return result;
  })
  .catch((err) => {
    promptError = err;
    promptDone = true;
    return null;
  });
promptPromise.finally(() => {
  setTimeout(abortEvents, 30000);
});

function trackAssistantEvent(event) {
  if (!event || typeof event !== "object") {
    return false;
  }
  if (event.type === "message.updated") {
    const info = event?.properties?.info;
    if (info && info.role === "assistant" && typeof info.id === "string") {
      assistantMessageIds.add(info.id);
      logDebug("assistant message updated", {
        messageId: info.id,
        sessionId: info.sessionID,
        completed: info?.time?.completed ?? null,
      });
      if (info.error && typeof info.error === "object") {
        const message =
          info.error?.data?.message ??
          info.error?.message ??
          JSON.stringify(info.error);
        sawError = true;
        errorMessage = `assistant error: ${message}`;
      }
      return true;
    }
  }
  if (event.type === "message.part.updated") {
    const part = event?.properties?.part;
    if (part && typeof part.messageID === "string") {
      if (assistantMessageIds.has(part.messageID)) {
        if (part.type === "text") {
          const delta = event?.properties?.delta;
          if (typeof delta === "string" && delta.trim()) {
            sawAssistantContent = true;
          } else if (typeof part.text === "string" && part.text.trim()) {
            sawAssistantContent = true;
          }
        } else if (part.type === "reasoning") {
          const delta = event?.properties?.delta;
          if (typeof delta === "string" && delta.trim()) {
            sawAssistantContent = true;
          } else if (typeof part.text === "string" && part.text.trim()) {
            sawAssistantContent = true;
          }
        } else if (part.type === "tool") {
          const state = part.state;
          if (state && typeof state === "object") {
            if (typeof state.output === "string" && state.output.trim()) {
              sawAssistantContent = true;
            }
            if (typeof state.error === "string" && state.error.trim()) {
              sawAssistantContent = true;
            }
          }
        }
        return true;
      }
      return false;
    }
  }
  return false;
}
try {
  for await (const event of events.stream) {
    if (!event || typeof event !== "object") {
      continue;
    }
    if (DEBUG) {
      logDebug("event", {
        type: event.type,
        sessionId: extractSessionIdFromEvent(event),
      });
      if (DEBUG_RAW) {
        logDebug("event.raw", event);
      }
    }
    const eventSessionId = extractSessionIdFromEvent(event);
    if (eventSessionId && eventSessionId !== sessionId) {
      logDebug("skipping event (session mismatch)", {
        eventSessionId,
        sessionId,
      });
      continue;
    }
    recordQuestionMapping(event);
    if (await maybeHandlePermissionEvent(event)) {
      continue;
    }
    if (trackAssistantEvent(event)) {
      sawAssistantEvent = true;
    }
    if (event.type === "session.error") {
      const err =
        event?.properties?.error?.data?.message ??
        event?.properties?.error?.message ??
        JSON.stringify(event?.properties?.error ?? event);
      sawError = true;
      errorMessage = `session error: ${err}`;
    }
    writeEvent(event);
    if (isAssistantMessageCompleted(event, sessionId)) {
      logDebug("breaking on assistant completion", { sessionId });
      break;
    }
    if (isSessionIdleEvent(event, sessionId)) {
      logDebug("breaking on session idle", { sessionId });
      break;
    }
  }
} finally {
  eventsController.abort();
}
await promptPromise;
if (promptError) {
  logDebug("prompt error", {
    message: promptError instanceof Error ? promptError.message : String(promptError),
  });
  writeEvent({
    type: "error",
    message: promptError instanceof Error ? promptError.message : String(promptError),
  });
  sawError = true;
  errorMessage =
    promptError instanceof Error ? promptError.message : String(promptError);
} else if ((!sawAssistantEvent || !sawAssistantContent) && promptResult) {
  logDebug("emitting assistant_message fallback", {
    sawAssistantEvent,
    sawAssistantContent,
  });
  writeEvent({
    type: "assistant_message",
    sessionId,
    message: promptResult,
  });
}
if (sawError && errorMessage) {
  writeEvent({
    type: "error",
    message: errorMessage,
  });
  process.exitCode = 1;
}
rl.close();

if (serverHandle && typeof serverHandle.stop === "function") {
  logDebug("closing server handle (stop)");
  await serverHandle.stop();
} else if (serverHandle && typeof serverHandle.close === "function") {
  logDebug("closing server handle (close)");
  await serverHandle.close();
}
