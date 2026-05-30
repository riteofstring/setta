#!/usr/bin/env node
import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { existsSync } from "node:fs";
import { appendFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(scriptDir, "..");
const repoRoot = resolve(desktopRoot, "..");
const options = parseArgs(process.argv.slice(2));
const recordingRoot = chatWorkflowRecordingRoot(options);
const pageLoadTimeoutMs = 20_000;
const workflowTimeoutMs = 15_000;
const liveWorkflowTimeoutMs = 120_000;
const shutdownTimeoutMs = 10_000;

class CDPClient {
  constructor(socket) {
    this.nextId = 1;
    this.pending = new Map();
    this.socket = socket;
    socket.addEventListener("message", (event) => {
      this.handleMessage(event.data);
    });
  }

  static async connect(url) {
    const socket = new globalThis.WebSocket(url);
    await new Promise((resolvePromise, reject) => {
      socket.addEventListener("open", resolvePromise, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });
    return new CDPClient(socket);
  }

  call(method, params = {}) {
    const id = this.nextId;
    this.nextId += 1;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolvePromise, reject) => {
      this.pending.set(id, { reject, resolve: resolvePromise });
    });
  }

  async evaluate(expression) {
    const result = await this.call("Runtime.evaluate", {
      awaitPromise: true,
      expression,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text);
    }
    return result.result.value;
  }

  close() {
    this.socket.close();
  }

  handleMessage(data) {
    const message = JSON.parse(data);
    if (!message.id || !this.pending.has(message.id)) {
      return;
    }
    const pending = this.pending.get(message.id);
    this.pending.delete(message.id);
    if (message.error) {
      pending.reject(new Error(JSON.stringify(message.error)));
      return;
    }
    pending.resolve(message.result);
  }
}

function parseArgs(args) {
  const parsed = {
    deterministic: true,
    keepArtifacts: false,
    live: false,
    visible: process.env.SETTA_E2E_VISIBLE === "1",
  };
  for (const arg of args) {
    switch (arg) {
      case "--deterministic-only":
        parsed.deterministic = true;
        parsed.live = false;
        break;
      case "--live-only":
        parsed.deterministic = false;
        parsed.live = true;
        break;
      case "--all":
        parsed.deterministic = true;
        parsed.live = true;
        break;
      case "--keep-artifacts":
        parsed.keepArtifacts = true;
        break;
      case "--visible":
        parsed.visible = true;
        break;
      default:
        throw new Error(`unknown chat workflow argument: ${arg}`);
    }
  }
  return parsed;
}

function chatWorkflowRecordingRoot(parsed) {
  const base = join(repoRoot, "test-results", "electron-integration", "chat-workflows");
  if (!parsed.keepArtifacts) {
    return base;
  }
  return join(base, pathTimestamp());
}

async function main() {
  assertBuildExists();
  if (!options.keepArtifacts && options.deterministic) {
    await rm(recordingRoot, { force: true, recursive: true });
  }
  await mkdir(recordingRoot, { recursive: true });

  const results = [];
  if (options.deterministic) {
    await runDeterministicWorkflowLaunch(results);
    await runRestartWorkflow(results);
  }
  if (options.live) {
    await runLiveCodexWorkflow(results);
  }

  process.stdout.write("Electron chat workflow results:\n");
  for (const result of results) {
    process.stdout.write(`  passed: ${result}\n`);
  }
}

async function runDeterministicWorkflowLaunch(results) {
  const fixture = await createFixture("deterministic");
  const recordingDir = join(recordingRoot, "deterministic");
  const context = await launchContext(fixture, recordingDir);
  let failure = null;

  try {
    const backend = await backendProbe(recordingDir);
    const workspaceId = await openWorkspace(context.client, fixture.workspaceRoot, backend);
    await runWorkflowStep(results, recordingDir, "happy-path", context.client, async () => {
      const conversationId = await createChat(context.client, backend, workspaceId);
      await runHappyPathWorkflow(context.client, backend, workspaceId, conversationId);
    });
    await runWorkflowStep(results, recordingDir, "cancel-queue", context.client, async () => {
      const conversationId = await createChat(context.client, backend, workspaceId);
      await runCancelWorkflow(context.client, backend, workspaceId, conversationId);
    });
    await runWorkflowStep(results, recordingDir, "fail-queue", context.client, async () => {
      const conversationId = await createChat(context.client, backend, workspaceId);
      await runFailWorkflow(context.client, backend, workspaceId, conversationId);
    });
    await runWorkflowStep(results, recordingDir, "approvals", context.client, async () => {
      const conversationId = await createChat(context.client, backend, workspaceId);
      await runApprovalsWorkflow(context.client, backend, workspaceId, conversationId);
    });
  } catch (error) {
    failure = error;
    await captureScreenshot(context.client, join(recordingDir, "failure.png")).catch(() => {});
  } finally {
    context.client?.close();
    await stopElectron(context.electron);
    await rm(fixture.tempRoot, { force: true, recursive: true });
  }

  if (failure) {
    throw failureWithLogs(failure, context.electron.logs);
  }
  await assertRecordingEvidence(recordingDir, {
    backendPaths: [
      "/workspaces/open",
      "/chat/conversations/create",
      "/chat/messages/send",
      "/chat/messages/queue",
      "/chat/messages/steer",
      "/chat/runs/active",
      "/chat/runs/list",
      "/chat/runs/cancel",
      "/chat/approvals/submit",
    ],
    ipcChannels: [
      "workspace:open-local-folder",
      "chat:create-conversation",
      "chat:send-message",
      "chat:queue-message",
      "chat:steer-message",
      "chat:cancel-run",
      "chat:submit-approval",
    ],
  });
}

async function runWorkflowStep(results, recordingDir, name, client, workflow) {
  try {
    await workflow();
    await captureScreenshot(client, join(recordingDir, `${name}-success.png`));
  } catch (error) {
    await captureScreenshot(client, join(recordingDir, `${name}-failure.png`)).catch(() => {});
    throw error;
  }
  results.push(name);
  await appendWorkflowState(recordingDir, { name, status: "passed" });
  process.stdout.write(`Electron chat workflow passed: ${name}\n`);
}

async function runRestartWorkflow(results) {
  const fixture = await createFixture("restart");
  const firstRecording = join(recordingRoot, "restart", "first-launch");
  const secondRecording = join(recordingRoot, "restart", "second-launch");
  let first = null;
  let second = null;

  try {
    first = await launchContext(fixture, firstRecording);
    await openWorkspaceAndCreateChat(first.client, fixture.workspaceRoot);
    await submitComposer(first.client, "persisted durable message", "Send message");
    await waitForTexts(first.client, [
      "persisted durable message",
      "Scripted response: persisted durable message",
    ]);
    await stopLaunchedContext(first);

    second = await launchContext(fixture, secondRecording);
    await waitForTexts(second.client, [
      fixture.workspaceRoot,
      "persisted durable message",
      "Scripted response: persisted durable message",
      "Stream",
    ]);
    await captureScreenshot(second.client, join(secondRecording, "restored.png"));
  } catch (error) {
    await captureScreenshot(
      first?.client ?? second?.client,
      join(recordingRoot, "restart", "failure.png"),
    ).catch(() => {});
    const logs = [...(first?.electron.logs ?? []), ...(second?.electron.logs ?? [])];
    throw failureWithLogs(error, logs);
  } finally {
    await stopLaunchedContext(first);
    await stopLaunchedContext(second);
    await rm(fixture.tempRoot, { force: true, recursive: true });
  }

  await assertRecordingEvidence(firstRecording, {
    backendPaths: ["/workspaces/open", "/chat/conversations/create", "/chat/messages/send"],
    ipcChannels: ["workspace:open-local-folder", "chat:create-conversation", "chat:send-message"],
  });
  await assertRecordingEvidence(secondRecording, {
    backendPaths: ["/workspace-session", "/chat/conversations/list", "/chat/messages/page"],
    ipcChannels: ["workspace:session", "chat:list-conversations", "chat:message-page"],
  });
  results.push("restart");
  process.stdout.write("Electron chat workflow passed: restart\n");
}

async function runLiveCodexWorkflow(results) {
  const liveEnv = await prepareLiveCodexEnv();
  const fixture = await createFixture("live-codex");
  const recordingDir = join(recordingRoot, "live-codex");
  const context = await launchContext(fixture, recordingDir, {
    extraEnv: liveEnv.env,
    harness: "codex",
  });
  let failure = null;

  try {
    const backend = await backendProbe(recordingDir);
    const workspaceId = await openWorkspace(context.client, fixture.workspaceRoot, backend);
    const conversationId = await createChat(context.client, backend, workspaceId);
    await submitComposer(
      context.client,
      "Reply with one short sentence containing the exact phrase setta live electron smoke.",
      "Send message",
    );
    const run = await waitForRunWithPrompt(
      backend,
      workspaceId,
      conversationId,
      "Reply with one short sentence containing the exact phrase setta live electron smoke.",
      null,
    );
    await waitForRunStatus(
      backend,
      workspaceId,
      conversationId,
      run.id,
      "completed",
      liveWorkflowTimeoutMs,
    );
    await assertNoActiveRun(backend, workspaceId, conversationId);
    await assertAssistantCompleted(backend, workspaceId, conversationId, run.id);
    await waitForAssistantTextRendered(context.client, liveWorkflowTimeoutMs);
    await assertNoCriticalDiagnostics(backend, workspaceId, conversationId);
    await captureScreenshot(context.client, join(recordingDir, "success.png"));
  } catch (error) {
    failure = error;
    await captureScreenshot(context.client, join(recordingDir, "failure.png")).catch(() => {});
  } finally {
    context.client?.close();
    await stopElectron(context.electron);
    await rm(fixture.tempRoot, { force: true, recursive: true });
    await rm(liveEnv.codexHome, { force: true, recursive: true });
  }

  if (failure) {
    throw failureWithLogs(failure, context.electron.logs);
  }
  await assertRecordingEvidence(recordingDir, {
    backendPaths: [
      "/workspaces/open",
      "/chat/conversations/create",
      "/chat/messages/send",
      "/chat/messages/page",
      "/chat/runs/active",
      "/chat/runs/list",
      "/chat/diagnostics/list",
    ],
    ipcChannels: ["workspace:open-local-folder", "chat:create-conversation", "chat:send-message"],
  });
  results.push("live-codex-electron");
  process.stdout.write("Electron chat workflow passed: live-codex-electron\n");
}

async function prepareLiveCodexEnv() {
  const openAIKey = await openAIKeyFromDotEnv();
  const codexHome = await mkdtemp(join(tmpdir(), "setta-live-codex-home-"));
  await runCommand("codex", ["login", "--with-api-key"], {
    env: { ...process.env, CODEX_HOME: codexHome },
    input: openAIKey + "\n",
  });
  return {
    codexHome,
    env: {
      CODEX_HOME: codexHome,
      OPENAI_API_KEY: openAIKey,
    },
  };
}

async function openAIKeyFromDotEnv() {
  const content = await readFile(join(repoRoot, ".env"), "utf8");
  for (const line of content.split("\n")) {
    const parsed = parseDotEnvLine(line);
    if (parsed?.key === "OPENAI_API_KEY" && parsed.value !== "") {
      return parsed.value;
    }
  }
  throw new Error("OPENAI_API_KEY is not present in .env");
}

function parseDotEnvLine(line) {
  const trimmed = line.trim();
  if (trimmed === "" || trimmed.startsWith("#")) {
    return null;
  }
  const withoutExport = trimmed.startsWith("export ")
    ? trimmed.slice("export ".length).trim()
    : trimmed;
  const separator = withoutExport.indexOf("=");
  if (separator === -1) {
    return null;
  }
  const key = withoutExport.slice(0, separator).trim();
  let value = withoutExport.slice(separator + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return { key, value };
}

async function runCommand(command, args, { env, input }) {
  const child = spawn(command, args, {
    env,
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stderr = "";
  child.stdout.on("data", () => {});
  child.stderr.on("data", (data) => {
    stderr += data.toString();
  });
  if (input !== undefined) {
    child.stdin.end(input);
  }
  const code = await onceExit(child);
  if (code !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited with ${code}: ${stderr}`);
  }
}

async function waitForAssistantTextRendered(client, timeoutMs) {
  await waitForState(
    client,
    `(() => {
      const rows = Array.from(document.querySelectorAll('[data-testid="chat-message"]'));
      const assistantTexts = rows
        .filter((row) => row.className.includes("justify-start"))
        .map((row) => row.innerText.trim())
        .filter((text) => text !== "" && text !== "...");
      return { assistantTexts };
    })()`,
    (value) => value.assistantTexts.length > 0,
    timeoutMs,
  );
}

async function stopLaunchedContext(context) {
  if (!context) {
    return;
  }
  context.client?.close();
  await stopElectron(context.electron);
}

async function runHappyPathWorkflow(client, backend, workspaceId, conversationId) {
  await submitComposer(client, "workflow hold for queue and steering", "Send message");
  const activeRun = await waitForRunWithPrompt(
    backend,
    workspaceId,
    conversationId,
    "workflow hold for queue and steering",
    "running",
  );
  await waitForText(client, "Workflow stream started.");
  await submitComposer(client, "queued follow-up from active run", "Queue follow-up");
  const queuedRun = await waitForRunWithPrompt(
    backend,
    workspaceId,
    conversationId,
    "queued follow-up from active run",
    "queued",
  );
  await waitForTexts(client, ["queued follow-up from active run", "Queued"]);
  await submitComposer(client, "steer active run", "Send steering message");
  await waitForTexts(client, [
    "Steered with steer active run.",
    "Active workflow complete.",
    "Queued follow-up response rendered through the app.",
  ]);
  await waitForRunStatus(backend, workspaceId, conversationId, activeRun.id, "completed");
  await waitForRunStatus(backend, workspaceId, conversationId, queuedRun.id, "completed");
  await assertNoActiveRun(backend, workspaceId, conversationId);
  await assertAssistantCompleted(backend, workspaceId, conversationId, queuedRun.id);
}

async function runCancelWorkflow(client, backend, workspaceId, conversationId) {
  await submitComposer(client, "cancel active workflow", "Send message");
  const activeRun = await waitForRunWithPrompt(
    backend,
    workspaceId,
    conversationId,
    "cancel active workflow",
    "running",
  );
  await waitForText(client, "Cancel workflow waiting.");
  await submitComposer(client, "queued follow-up after cancel", "Queue follow-up");
  const queuedRun = await waitForRunWithPrompt(
    backend,
    workspaceId,
    conversationId,
    "queued follow-up after cancel",
    "queued",
  );
  await waitForTexts(client, ["queued follow-up after cancel", "Queued"]);
  await clickButtonByAria(client, "Stop run");
  await waitForText(client, "Cancelled");
  await assertQueuedRunNotPromoted(
    backend,
    workspaceId,
    conversationId,
    activeRun.id,
    queuedRun.id,
    "cancelled",
  );
  await assertRendererQueueMatchesBackend(client, "queued follow-up after cancel");
  await assertTextAbsent(client, "Queued follow-up response rendered through the app.");
}

async function runFailWorkflow(client, backend, workspaceId, conversationId) {
  await submitComposer(client, "fail active workflow", "Send message");
  const activeRun = await waitForRunWithPrompt(
    backend,
    workspaceId,
    conversationId,
    "fail active workflow",
    "running",
  );
  await waitForText(client, "Failure workflow waiting.");
  await submitComposer(client, "queued follow-up after failure", "Queue follow-up");
  const queuedRun = await waitForRunWithPrompt(
    backend,
    workspaceId,
    conversationId,
    "queued follow-up after failure",
    "queued",
  );
  await waitForTexts(client, ["queued follow-up after failure", "Queued"]);
  await submitComposer(client, "trigger scripted failure", "Send steering message");
  await waitForTexts(client, ["Scripted failure surfaced.", "Failed"]);
  await assertQueuedRunNotPromoted(
    backend,
    workspaceId,
    conversationId,
    activeRun.id,
    queuedRun.id,
    "failed",
  );
  await assertRendererQueueMatchesBackend(client, "queued follow-up after failure");
  await assertTextAbsent(client, "Queued follow-up response rendered through the app.");
}

async function runApprovalsWorkflow(client, backend, workspaceId, conversationId) {
  await approveDecisionWorkflow(client, "command approval workflow", "Command approval");
  await approveDecisionWorkflow(client, "file approval workflow", "File change approval");
  await approveDecisionWorkflow(client, "permission approval workflow", "Permission approval");
  await answerUserInputApproval(client);
  await assertNoCriticalDiagnostics(backend, workspaceId, conversationId);
}

async function approveDecisionWorkflow(client, prompt, title) {
  await submitComposer(client, prompt, "Send message");
  await waitForText(client, title);
  await clickButtonByText(client, "Approve");
  await waitForText(client, `${title} resolved.`);
}

async function answerUserInputApproval(client) {
  await submitComposer(client, "user input approval workflow", "Send message");
  await waitForText(client, "User input approval");
  await setInputValue(client, 'input[type="text"]', "scripted answer");
  await clickButtonByText(client, "Answer");
  await waitForText(client, "User input approval resolved.");
}

async function openWorkspaceAndCreateChat(client, workspaceRoot) {
  await waitForTexts(client, ["setta-backend dev", "Stream"]);
  await clickButtonByAria(client, "Open workspace folder");
  await waitForTexts(client, [workspaceRoot, "No chats yet"]);
  await clickButtonByAria(client, "New chat");
  await waitForTexts(client, ["New chat"]);
  await waitForComposerReady(client);
}

async function openWorkspace(client, workspaceRoot, backend) {
  await waitForTexts(client, ["setta-backend dev", "Stream"]);
  await clickButtonByAria(client, "Open workspace folder");
  await waitForTexts(client, [workspaceRoot, "No chats yet"]);
  const session = await waitForBackendState(
    async () => backend.get("/workspace-session"),
    (value) => Boolean(value.selectedWorkspaceId),
  );
  return session.selectedWorkspaceId;
}

async function createChat(client, backend, workspaceId) {
  const before = await backend.post("/chat/conversations/list", { workspaceId });
  const existing = new Set(before.conversations.map((item) => item.conversation.id));
  await clickButtonByAria(client, "New chat");
  await waitForTexts(client, ["New chat"]);
  await waitForComposerReady(client);
  const after = await waitForBackendState(
    async () => backend.post("/chat/conversations/list", { workspaceId }),
    (value) => value.conversations.some((item) => !existing.has(item.conversation.id)),
  );
  const created = after.conversations.find((item) => !existing.has(item.conversation.id));
  if (!created) {
    throw new Error("new conversation was not returned by the backend");
  }
  return created.conversation.id;
}

async function submitComposer(client, text, buttonLabel) {
  await waitForComposerReady(client);
  await setInputValue(client, 'textarea[placeholder="Ask Codex"]', text);
  await clickButtonByAria(client, buttonLabel);
}

async function waitForComposerReady(client) {
  await waitForState(client, composerReadyExpression(), (value) => value.ready);
}

function composerReadyExpression() {
  return `(() => {
    const textarea = document.querySelector('textarea[placeholder="Ask Codex"]');
    return { ready: Boolean(textarea && !textarea.disabled) };
  })()`;
}

async function setInputValue(client, selector, value) {
  const changed = await client.evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element || element.disabled) {
      return false;
    }
    const prototype = element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
    descriptor.set.call(element, ${JSON.stringify(value)});
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  })()`);
  if (!changed) {
    throw new Error(`input was not editable: ${selector}`);
  }
}

async function clickButtonByAria(client, label) {
  await waitForState(client, buttonStateExpression("aria-label", label), (value) => value.ready);
  const clicked = await client.evaluate(buttonClickExpression("aria-label", label));
  if (!clicked) {
    throw new Error(`button was not clickable: ${label}`);
  }
}

async function clickButtonByText(client, text) {
  await waitForState(client, buttonStateExpression("text", text), (value) => value.ready);
  const clicked = await client.evaluate(buttonClickExpression("text", text));
  if (!clicked) {
    throw new Error(`button was not clickable: ${text}`);
  }
}

function buttonStateExpression(kind, value) {
  return `(() => {
    const button = findWorkflowButton(${JSON.stringify(kind)}, ${JSON.stringify(value)});
    return { body: document.body.innerText, ready: Boolean(button && !button.disabled) };
  })()`;
}

function buttonClickExpression(kind, value) {
  return `(() => {
    const button = findWorkflowButton(${JSON.stringify(kind)}, ${JSON.stringify(value)});
    if (!button || button.disabled) {
      return false;
    }
    button.click();
    return true;
  })()`;
}

async function waitForText(client, text) {
  await waitForTexts(client, [text]);
}

async function waitForTexts(client, texts) {
  await waitForState(client, bodyTextExpression(), (value) =>
    texts.every((text) => value.body.includes(text)),
  );
}

async function assertTextAbsent(client, text) {
  const body = await client.evaluate("document.body.innerText");
  if (body.includes(text)) {
    throw new Error(`unexpected rendered text: ${text}`);
  }
}

function bodyTextExpression() {
  return `(() => ({ body: document.body.innerText }))()`;
}

async function waitForState(client, expression, isReady, timeoutMs = workflowTimeoutMs) {
  const startedAt = Date.now();
  let lastValue = null;
  while (Date.now() - startedAt < timeoutMs) {
    lastValue = await client.evaluate(expression);
    if (isReady(lastValue)) {
      return lastValue;
    }
    await delay(100);
  }
  throw new Error(`timed out waiting for Electron workflow state: ${JSON.stringify(lastValue)}`);
}

async function backendProbe(recordingDir) {
  const baseURL = await waitForBackendURL(recordingDir);
  await writeFile(join(recordingDir, "backend-url.txt"), baseURL + "\n");
  return {
    baseURL,
    get: (path) => backendRequest(recordingDir, baseURL, "GET", path),
    post: (path, payload) => backendRequest(recordingDir, baseURL, "POST", path, payload),
  };
}

async function backendRequest(recordingDir, baseURL, method, path, payload) {
  const response = await globalThis.fetch(baseURL + path, {
    body: payload === undefined ? undefined : JSON.stringify(payload),
    headers: payload === undefined ? undefined : { "Content-Type": "application/json" },
    method,
  });
  const body = await response.text();
  await appendWorkflowState(recordingDir, {
    method,
    ok: response.ok,
    path,
    status: response.status,
    type: "backend_request",
  });
  if (!response.ok) {
    throw new Error(`${method} ${path} returned ${response.status}: ${body}`);
  }
  return JSON.parse(body);
}

async function waitForBackendURL(recordingDir) {
  const eventsPath = join(recordingDir, "events.jsonl");
  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt < pageLoadTimeoutMs) {
    try {
      const events = await readJsonLines(eventsPath);
      const started = events.find((entry) => entry.type === "backend_started");
      const url = started?.payload?.url;
      if (typeof url === "string" && url !== "") {
        return url;
      }
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  throw new Error(`backend URL was not recorded: ${lastError?.message ?? "timed out"}`);
}

async function waitForBackendState(readState, isReady, timeoutMs = workflowTimeoutMs) {
  const startedAt = Date.now();
  let lastValue = null;
  while (Date.now() - startedAt < timeoutMs) {
    lastValue = await readState();
    if (isReady(lastValue)) {
      return lastValue;
    }
    await delay(100);
  }
  throw new Error(`timed out waiting for backend state: ${JSON.stringify(lastValue)}`);
}

async function waitForRunWithPrompt(backend, workspaceId, conversationId, prompt, status) {
  return waitForBackendState(async () => {
    const list = await backend.post("/chat/runs/list", { conversationId, workspaceId });
    return (
      list.runs.find(
        (run) => run.promptSummary === prompt && (status === null || run.status === status),
      ) ?? null
    );
  }, Boolean);
}

async function waitForRunStatus(backend, workspaceId, conversationId, runId, status, timeoutMs) {
  return waitForBackendState(
    async () => {
      const list = await backend.post("/chat/runs/list", { conversationId, workspaceId });
      return list.runs.find((run) => run.id === runId) ?? null;
    },
    (run) => run?.status === status,
    timeoutMs,
  );
}

async function assertNoActiveRun(backend, workspaceId, conversationId) {
  const active = await waitForBackendState(
    async () => backend.post("/chat/runs/active", { conversationId, workspaceId }),
    (value) => !value.hasActiveRun,
  );
  if (active.run !== null && active.run !== undefined) {
    throw new Error(
      `active run payload was present after terminal state: ${JSON.stringify(active)}`,
    );
  }
}

async function assertQueuedRunNotPromoted(
  backend,
  workspaceId,
  conversationId,
  activeRunId,
  queuedRunId,
  terminalStatus,
) {
  await waitForRunStatus(backend, workspaceId, conversationId, activeRunId, terminalStatus);
  await assertNoActiveRun(backend, workspaceId, conversationId);
  const list = await backend.post("/chat/runs/list", { conversationId, workspaceId });
  const queued = list.runs.find((run) => run.id === queuedRunId);
  if (!queued) {
    throw new Error(`queued run ${queuedRunId} was not returned by /chat/runs/list`);
  }
  if (queued.status !== "queued") {
    throw new Error(`queued run ${queuedRunId} status = ${queued.status}, want queued`);
  }
  if (queued.startedAt !== "" || queued.assistantMessageId !== "") {
    throw new Error(`queued run ${queuedRunId} was partially promoted: ${JSON.stringify(queued)}`);
  }
  const page = await backend.post("/chat/messages/page", {
    conversationId,
    limit: 40,
    workspaceId,
  });
  if (!page.queue.runs.some((run) => run.id === queuedRunId)) {
    throw new Error(`queued run ${queuedRunId} was not present in page queue state`);
  }
  const queuedAssistant = page.messages.find(
    (message) => message.runId === queuedRunId && message.role === "assistant",
  );
  if (queuedAssistant) {
    throw new Error(
      `queued run ${queuedRunId} has assistant message: ${JSON.stringify(queuedAssistant)}`,
    );
  }
}

async function assertAssistantCompleted(backend, workspaceId, conversationId, runId) {
  const page = await backend.post("/chat/messages/page", {
    conversationId,
    limit: 40,
    workspaceId,
  });
  const assistant = page.messages.find(
    (message) => message.runId === runId && message.role === "assistant",
  );
  if (!assistant || assistant.status !== "complete" || messageText(assistant).trim() === "") {
    throw new Error(
      `assistant response for run ${runId} was not complete: ${JSON.stringify(assistant)}`,
    );
  }
}

async function assertRendererQueueMatchesBackend(client, queuedPrompt) {
  const body = await client.evaluate("document.body.innerText");
  if (!body.includes(queuedPrompt) || !body.includes("Queued")) {
    throw new Error(`renderer did not show queued state for ${queuedPrompt}: ${body}`);
  }
}

async function assertNoCriticalDiagnostics(backend, workspaceId, conversationId) {
  const diagnostics = await backend.post("/chat/diagnostics/list", {
    conversationId,
    runId: "",
    workspaceId,
  });
  const critical = diagnostics.diagnostics.filter(
    (diagnostic) => diagnostic.severity === "critical",
  );
  if (critical.length > 0) {
    throw new Error(`critical diagnostics recorded: ${JSON.stringify(critical)}`);
  }
}

function messageText(message) {
  return message.parts.map((part) => part.text).join("");
}

async function launchContext(fixture, recordingDir, options = {}) {
  await rm(recordingDir, { force: true, recursive: true });
  await mkdir(recordingDir, { recursive: true });
  const debugPort = await openPort();
  const electron = launchElectron(debugPort, fixture, recordingDir, options);
  const client = await connectToSettaPage(debugPort);
  await client.call("Runtime.enable");
  await installPageHelpers(client);
  return { client, electron };
}

async function installPageHelpers(client) {
  await client.evaluate(`(() => {
    window.findWorkflowButton = (kind, expected) => {
      const buttons = Array.from(document.querySelectorAll("button"));
      return buttons.find((button) => {
        if (kind === "aria-label") {
          return button.getAttribute("aria-label") === expected;
        }
        return button.innerText.trim() === expected;
      }) ?? null;
    };
  })()`);
}

function launchElectron(debugPort, fixture, recordingDir, launchOptions = {}) {
  const harness = launchOptions.harness ?? "scripted-workflow";
  const extraEnv = launchOptions.extraEnv ?? {};
  const e2eEnv = {
    SETTA_E2E: "1",
    SETTA_E2E_OPEN_WORKSPACE_ROOT: fixture.workspaceRoot,
    ...(options.visible ? { SETTA_E2E_VISIBLE: "1" } : {}),
    ...(harness === "scripted-workflow" ? { SETTA_E2E_CHAT_HARNESS: "scripted-workflow" } : {}),
  };
  const electron = spawn(electronBin(), [`--remote-debugging-port=${debugPort}`, "."], {
    cwd: desktopRoot,
    env: {
      ...process.env,
      ...extraEnv,
      ...e2eEnv,
      SETTA_APP_DATA_DIR: fixture.appDataDir,
      SETTA_RECORD_INCLUDE_PAYLOADS: "1",
      SETTA_RECORD_SCREENSHOT_INTERVAL_MS: "0",
      SETTA_RECORDING: "1",
      SETTA_RECORDING_DIR: recordingDir,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  electron.logs = [];
  collectProcessOutput(electron);
  return electron;
}

async function createFixture(name) {
  const tempRoot = await mkdtemp(join(tmpdir(), `setta-electron-${name}-`));
  const appDataDir = join(tempRoot, "app-data");
  const workspaceRoot = join(tempRoot, "workspace-root");
  await mkdir(appDataDir, { recursive: true });
  await mkdir(workspaceRoot, { recursive: true });
  return { appDataDir, tempRoot, workspaceRoot };
}

function assertBuildExists() {
  const mainPath = join(desktopRoot, "out", "main", "index.js");
  if (!existsSync(mainPath)) {
    throw new Error(`desktop build is missing: ${mainPath}. Run pnpm -C desktop build first.`);
  }
}

async function openPort() {
  const server = createServer();
  await new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolvePromise);
  });
  const address = server.address();
  await new Promise((resolvePromise, reject) => {
    server.close((error) => (error ? reject(error) : resolvePromise()));
  });
  if (address === null || typeof address === "string") {
    throw new Error("failed to reserve Electron debugging port");
  }
  return address.port;
}

async function connectToSettaPage(debugPort) {
  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt < pageLoadTimeoutMs) {
    try {
      const page = await settaPageTarget(debugPort);
      if (page) {
        return CDPClient.connect(page.webSocketDebuggerUrl);
      }
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  throw new Error(`Setta page target was not available: ${lastError?.message ?? "timed out"}`);
}

async function settaPageTarget(debugPort) {
  const response = await globalThis.fetch(`http://127.0.0.1:${debugPort}/json/list`);
  if (!response.ok) {
    throw new Error(`DevTools target list returned ${response.status}`);
  }
  const targets = await response.json();
  return targets.find((target) => target.type === "page" && target.title === "Setta") ?? null;
}

async function stopElectron(child) {
  if (child.exitCode !== null || child.killed) {
    return;
  }
  const exitPromise = onceExit(child);
  child.kill("SIGTERM");
  const exited = await Promise.race([
    exitPromise.then(() => true),
    delay(shutdownTimeoutMs).then(() => false),
  ]);
  if (!exited && child.exitCode === null) {
    child.kill("SIGKILL");
    await Promise.race([exitPromise, delay(3_000)]);
  }
}

function onceExit(child) {
  return new Promise((resolvePromise) => {
    child.once("exit", resolvePromise);
  });
}

function electronBin() {
  const extension = process.platform === "win32" ? ".cmd" : "";
  return join(desktopRoot, "node_modules", ".bin", `electron${extension}`);
}

function collectProcessOutput(child) {
  child.stdout.on("data", (data) => appendLog(child.logs, data));
  child.stderr.on("data", (data) => appendLog(child.logs, data));
}

function appendLog(logs, data) {
  logs.push(data.toString());
  if (logs.length > 100) {
    logs.shift();
  }
}

async function captureScreenshot(client, path) {
  if (!client) {
    return;
  }
  await mkdir(dirname(path), { recursive: true });
  const image = await client.call("Page.captureScreenshot", { format: "png" });
  await writeFile(path, Buffer.from(image.data, "base64"));
}

function failureWithLogs(error, logs) {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(`${message}\nElectron output:\n${logs.join("")}`);
}

async function assertRecordingEvidence(recordingDir, expected) {
  await assertNoIpcFailures(recordingDir);
  const ipc = await readJsonLines(join(recordingDir, "ipc.jsonl"));
  for (const channel of expected.ipcChannels) {
    if (!ipc.some((entry) => entry.type === "ipc_finish" && entry.channel === channel)) {
      throw new Error(`recording missing successful IPC channel: ${channel}`);
    }
  }
  const backend = await readJsonLines(join(recordingDir, "backend-http.jsonl"));
  const workflowState = await readJsonLinesOptional(join(recordingDir, "workflow-state.jsonl"));
  for (const path of expected.backendPaths) {
    if (
      !backend.some(
        (entry) =>
          entry.type === "backend_http_response" &&
          entry.status === 200 &&
          entry.url.includes(path),
      ) &&
      !workflowState.some(
        (entry) => entry.type === "backend_request" && entry.status === 200 && entry.path === path,
      )
    ) {
      throw new Error(`recording missing successful backend path: ${path}`);
    }
  }
}

async function assertNoIpcFailures(recordingDir) {
  const ipc = await readJsonLines(join(recordingDir, "ipc.jsonl"));
  const failures = ipc.filter((entry) => entry.type === "ipc_failure");
  if (failures.length > 0) {
    throw new Error(`recording included IPC failures: ${JSON.stringify(failures)}`);
  }
}

async function readJsonLines(path) {
  const content = await readFile(path, "utf8");
  return content
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line));
}

async function readJsonLinesOptional(path) {
  try {
    return await readJsonLines(path);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function appendWorkflowState(recordingDir, value) {
  await mkdir(recordingDir, { recursive: true });
  await appendFile(join(recordingDir, "workflow-state.jsonl"), JSON.stringify(value) + "\n");
}

function pathTimestamp() {
  return new Date().toISOString().replaceAll(":", "").replaceAll(".", "-");
}

main().catch((error) => {
  process.stderr.write(String(error instanceof Error ? error.message : error) + "\n");
  process.exitCode = 1;
});
