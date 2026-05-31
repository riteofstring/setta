#!/usr/bin/env node
import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(scriptDir, "..");
const repoRoot = resolve(desktopRoot, "..");
const options = parseArgs(process.argv.slice(2));
const recordingDir = corruptChatRecordingDir(options);
const pageLoadTimeoutMs = 20_000;
const workflowTimeoutMs = 10_000;
const shutdownTimeoutMs = 10_000;
const workspaceId = "workspace_electron_corrupt_chat";
const conversationId = "conversation_corrupt_history";
const runId = "run_missing_assistant_message";

function parseArgs(args) {
  const parsed = {
    keepArtifacts: false,
    visible: process.env.SETTA_E2E_VISIBLE === "1",
  };
  for (const arg of args) {
    switch (arg) {
      case "--keep-artifacts":
        parsed.keepArtifacts = true;
        break;
      case "--visible":
        parsed.visible = true;
        break;
      default:
        throw new Error(`unknown corrupt chat workflow argument: ${arg}`);
    }
  }
  return parsed;
}

function corruptChatRecordingDir(parsed) {
  const base = join(repoRoot, "test-results", "electron-integration", "corrupt-chat-workflow");
  if (!parsed.keepArtifacts) {
    return base;
  }
  return join(base, pathTimestamp());
}

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

async function main() {
  assertBuildExists();
  if (!options.keepArtifacts) {
    await rm(recordingDir, { force: true, recursive: true });
  }
  await mkdir(recordingDir, { recursive: true });
  const tempRoot = await mkdtemp(join(tmpdir(), "setta-electron-corrupt-chat-"));
  const fixture = await createCorruptChatFixture(tempRoot);
  const debugPort = await openPort();
  const electron = launchElectron(debugPort, fixture.appDataDir);
  let client = null;
  let failure = null;

  try {
    client = await connectToSettaPage(debugPort);
    await client.call("Runtime.enable");
    await waitForCorruptChatState(client);
    await clickNewChat(client);
    await waitForUsableNewChat(client);
    await captureScreenshot(client, join(recordingDir, "after-new-chat.png"));
  } catch (error) {
    failure = error;
    await captureScreenshot(client, join(recordingDir, "failure.png")).catch(() => {});
  } finally {
    client?.close();
    await stopElectron(electron);
    await rm(tempRoot, { force: true, recursive: true });
  }

  if (failure) {
    throw failureWithLogs(failure, electron.logs);
  }
  await assertRecordingProvesWorkflow(recordingDir);
  process.stdout.write("Electron corrupt-chat workflow passed.\n");
}

function assertBuildExists() {
  const mainPath = join(desktopRoot, "out", "main", "index.js");
  if (!existsSync(mainPath)) {
    throw new Error(`desktop build is missing: ${mainPath}. Run pnpm -C desktop build first.`);
  }
}

async function createCorruptChatFixture(tempRoot) {
  const appDataDir = join(tempRoot, "app-data");
  const workspaceRoot = join(tempRoot, "workspace-root");
  const workspaceDir = join(appDataDir, "workspaces", workspaceId);
  const now = "2026-05-31T01:00:00Z";
  const workspaceSummary = {
    displayName: "corrupt-chat-workspace",
    id: workspaceId,
    lastOpenedAt: now,
    rootPath: workspaceRoot,
  };
  await mkdir(join(workspaceDir, "conversations", conversationId), { recursive: true });
  await mkdir(join(workspaceDir, "runs"), { recursive: true });
  await mkdir(workspaceRoot, { recursive: true });
  await writeJson(join(appDataDir, "app-state.json"), {
    activeWorkspaceIds: [workspaceId],
    recentWorkspaces: [workspaceSummary],
    schemaVersion: 1,
    selectedWorkspaceId: workspaceId,
  });
  await writeJson(join(workspaceDir, "workspace.json"), {
    createdAt: now,
    displayName: workspaceSummary.displayName,
    id: workspaceId,
    rootPath: workspaceRoot,
    schemaVersion: 1,
    updatedAt: now,
  });
  await writeJson(join(workspaceDir, "conversations", conversationId, "conversation.json"), {
    archivedAt: "",
    createdAt: now,
    harnessRefs: [],
    id: conversationId,
    schemaVersion: 1,
    title: "Corrupt historical chat",
    updatedAt: now,
    workspaceId,
  });
  await writeJson(join(workspaceDir, "runs", `${runId}.json`), {
    completedAt: "2026-05-31T01:01:00Z",
    conversationId,
    error: "",
    harness: "codex",
    hasPendingApproval: false,
    id: runId,
    pendingApproval: emptyApproval(),
    promptSummary: "historical corrupt turn",
    schemaVersion: 1,
    startedAt: now,
    status: "completed",
    triggerMessageId: "message_trigger",
    workspaceId,
  });
  return { appDataDir, workspaceRoot };
}

function emptyApproval() {
  return {
    approved: false,
    body: "",
    command: "",
    createdAt: "",
    filePath: "",
    id: "",
    kind: "",
    options: [],
    permission: "",
    providerItemId: "",
    question: "",
    questions: [],
    resolvedAt: "",
    response: "",
    runId: "",
    runItemId: "",
    status: "",
    title: "",
  };
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2) + "\n");
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

function launchElectron(debugPort, appDataDir) {
  const electron = spawn(electronBin(), [`--remote-debugging-port=${debugPort}`, "."], {
    cwd: desktopRoot,
    env: {
      ...process.env,
      SETTA_E2E: "1",
      ...(options.visible ? { SETTA_E2E_VISIBLE: "1" } : {}),
      SETTA_APP_DATA_DIR: appDataDir,
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

function electronBin() {
  const extension = process.platform === "win32" ? ".cmd" : "";
  return join(desktopRoot, "node_modules", ".bin", `electron${extension}`);
}

function collectProcessOutput(child) {
  child.stdout.on("data", (data) => {
    appendLog(child.logs, data);
  });
  child.stderr.on("data", (data) => {
    appendLog(child.logs, data);
  });
}

function appendLog(logs, data) {
  logs.push(data.toString());
  if (logs.length > 80) {
    logs.shift();
  }
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

async function waitForCorruptChatState(client) {
  const state = await waitForState(client, corruptChatStateExpression(), (value) => value.ready);
  if (state.newChatDisabled) {
    throw new Error(`New chat is disabled in corrupt state: ${state.body}`);
  }
  if (!state.body.includes("setta-backend dev")) {
    throw new Error(`backend health was not rendered: ${state.body}`);
  }
  if (!state.body.includes("Stream")) {
    throw new Error(`event stream did not connect: ${state.body}`);
  }
}

function corruptChatStateExpression() {
  return `(() => {
    const button = document.querySelector('button[aria-label="New chat"]');
    const error = document.querySelector('[data-testid="chat-load-error"]');
    const body = document.body.innerText;
    return {
      body,
      newChatDisabled: button ? button.disabled : null,
      ready: Boolean(button && error && body.includes("Chat state is corrupt") && body.includes("malformed chat state")),
    };
  })()`;
}

async function clickNewChat(client) {
  const clicked = await client.evaluate(`(() => {
    const button = document.querySelector('button[aria-label="New chat"]');
    if (!button || button.disabled) {
      return false;
    }
    button.click();
    return true;
  })()`);
  if (!clicked) {
    throw new Error("New chat button was not clickable");
  }
}

async function waitForUsableNewChat(client) {
  const state = await waitForState(client, usableNewChatExpression(), (value) => value.ready);
  if (state.textareaDisabled) {
    throw new Error(`composer stayed disabled after New Chat: ${state.body}`);
  }
}

function usableNewChatExpression() {
  return `(() => {
    const textarea = document.querySelector('textarea[placeholder="Ask Codex"]');
    const conversations = Array.from(document.querySelectorAll('[data-testid="conversation-list-item"]'));
    const body = document.body.innerText;
    return {
      body,
      conversationCount: conversations.length,
      ready: Boolean(textarea && !textarea.disabled && conversations.length === 1 && body.includes("New chat")),
      textareaDisabled: textarea ? textarea.disabled : null,
    };
  })()`;
}

async function waitForState(client, expression, isReady) {
  const startedAt = Date.now();
  let lastValue = null;
  while (Date.now() - startedAt < workflowTimeoutMs) {
    lastValue = await client.evaluate(expression);
    if (isReady(lastValue)) {
      return lastValue;
    }
    await delay(100);
  }
  throw new Error(`timed out waiting for Electron workflow state: ${JSON.stringify(lastValue)}`);
}

async function captureScreenshot(client, path) {
  if (!client) {
    return;
  }
  await mkdir(dirname(path), { recursive: true });
  const image = await client.call("Page.captureScreenshot", { format: "png" });
  await writeFile(path, Buffer.from(image.data, "base64"));
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

function failureWithLogs(error, logs) {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(`${message}\nElectron output:\n${logs.join("")}`);
}

async function assertRecordingProvesWorkflow(dir) {
  const ipc = await readJsonLines(join(dir, "ipc.jsonl"));
  const createFinish = ipc.find(
    (entry) =>
      entry.type === "ipc_finish" &&
      entry.channel === "chat:create-conversation" &&
      entry.result?.title === "New chat",
  );
  if (!createFinish) {
    throw new Error("recording did not include a successful chat:create-conversation IPC call");
  }
  const corruptListFailure = ipc.find(
    (entry) =>
      entry.type === "ipc_failure" &&
      entry.channel === "chat:list-conversations" &&
      entry.error?.message?.includes("assistantMessageId is required unless queued"),
  );
  if (!corruptListFailure) {
    throw new Error("recording did not include the expected corrupt list failure");
  }
}

async function readJsonLines(path) {
  const content = await readFile(path, "utf8");
  return content
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line));
}

function pathTimestamp() {
  return new Date().toISOString().replaceAll(":", "").replaceAll(".", "-");
}

main().catch((error) => {
  process.stderr.write(String(error instanceof Error ? error.message : error) + "\n");
  process.exitCode = 1;
});
