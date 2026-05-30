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
const recordingRoot = join(repoRoot, "test-results", "electron-integration", "chat-workflows");
const pageLoadTimeoutMs = 20_000;
const workflowTimeoutMs = 15_000;
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

async function main() {
  assertBuildExists();
  await rm(recordingRoot, { force: true, recursive: true });
  await mkdir(recordingRoot, { recursive: true });

  await runSingleLaunchWorkflow("happy-path", runHappyPathWorkflow, {
    backendPaths: [
      "/workspaces/open",
      "/chat/conversations/create",
      "/chat/messages/send",
      "/chat/messages/queue",
      "/chat/messages/steer",
    ],
    ipcChannels: [
      "workspace:open-local-folder",
      "chat:create-conversation",
      "chat:send-message",
      "chat:queue-message",
      "chat:steer-message",
    ],
  });
  await runSingleLaunchWorkflow("cancel-queue", runCancelWorkflow, {
    backendPaths: ["/chat/messages/send", "/chat/messages/queue", "/chat/runs/cancel"],
    ipcChannels: ["chat:send-message", "chat:queue-message", "chat:cancel-run"],
  });
  await runSingleLaunchWorkflow("fail-queue", runFailWorkflow, {
    backendPaths: ["/chat/messages/send", "/chat/messages/queue", "/chat/messages/steer"],
    ipcChannels: ["chat:send-message", "chat:queue-message", "chat:steer-message"],
  });
  await runSingleLaunchWorkflow("approvals", runApprovalsWorkflow, {
    backendPaths: ["/chat/messages/send", "/chat/approvals/submit"],
    ipcChannels: ["chat:send-message", "chat:submit-approval"],
  });
  await runRestartWorkflow();

  process.stdout.write("Electron chat workflow suite passed: 5 deterministic workflows.\n");
}

async function runSingleLaunchWorkflow(name, workflow, evidence) {
  const fixture = await createFixture(name);
  const recordingDir = join(recordingRoot, name);
  const context = await launchContext(fixture, recordingDir);
  let failure = null;

  try {
    await workflow(context.client, fixture);
    await captureScreenshot(context.client, join(recordingDir, "success.png"));
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
  await assertRecordingEvidence(recordingDir, evidence);
  process.stdout.write(`Electron chat workflow passed: ${name}\n`);
}

async function runRestartWorkflow() {
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
  process.stdout.write("Electron chat workflow passed: restart\n");
}

async function stopLaunchedContext(context) {
  if (!context) {
    return;
  }
  context.client?.close();
  await stopElectron(context.electron);
}

async function runHappyPathWorkflow(client, fixture) {
  await openWorkspaceAndCreateChat(client, fixture.workspaceRoot);
  await submitComposer(client, "workflow hold for queue and steering", "Send message");
  await waitForText(client, "Workflow stream started.");
  await submitComposer(client, "queued follow-up from active run", "Queue follow-up");
  await waitForTexts(client, ["queued follow-up from active run", "Queued"]);
  await submitComposer(client, "steer active run", "Send steering message");
  await waitForTexts(client, [
    "Steered with steer active run.",
    "Active workflow complete.",
    "Queued follow-up response rendered through the app.",
  ]);
}

async function runCancelWorkflow(client, fixture) {
  await openWorkspaceAndCreateChat(client, fixture.workspaceRoot);
  await submitComposer(client, "cancel active workflow", "Send message");
  await waitForText(client, "Cancel workflow waiting.");
  await submitComposer(client, "queued follow-up after cancel", "Queue follow-up");
  await waitForTexts(client, ["queued follow-up after cancel", "Queued"]);
  await clickButtonByAria(client, "Stop run");
  await waitForText(client, "Cancelled");
  await assertTextDoesNotAppear(client, "Queued follow-up response rendered through the app.");
}

async function runFailWorkflow(client, fixture) {
  await openWorkspaceAndCreateChat(client, fixture.workspaceRoot);
  await submitComposer(client, "fail active workflow", "Send message");
  await waitForText(client, "Failure workflow waiting.");
  await submitComposer(client, "queued follow-up after failure", "Queue follow-up");
  await waitForTexts(client, ["queued follow-up after failure", "Queued"]);
  await submitComposer(client, "trigger scripted failure", "Send steering message");
  await waitForTexts(client, ["Scripted failure surfaced.", "Failed"]);
  await assertTextDoesNotAppear(client, "Queued follow-up response rendered through the app.");
}

async function runApprovalsWorkflow(client, fixture) {
  await openWorkspaceAndCreateChat(client, fixture.workspaceRoot);
  await approveDecisionWorkflow(client, "command approval workflow", "Command approval");
  await approveDecisionWorkflow(client, "file approval workflow", "File change approval");
  await approveDecisionWorkflow(client, "permission approval workflow", "Permission approval");
  await answerUserInputApproval(client);
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

async function assertTextDoesNotAppear(client, text) {
  await delay(700);
  const body = await client.evaluate("document.body.innerText");
  if (body.includes(text)) {
    throw new Error(`unexpected rendered text: ${text}`);
  }
}

function bodyTextExpression() {
  return `(() => ({ body: document.body.innerText }))()`;
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

async function launchContext(fixture, recordingDir) {
  await rm(recordingDir, { force: true, recursive: true });
  await mkdir(recordingDir, { recursive: true });
  const debugPort = await openPort();
  const electron = launchElectron(debugPort, fixture, recordingDir);
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

function launchElectron(debugPort, fixture, recordingDir) {
  const electron = spawn(electronBin(), [`--remote-debugging-port=${debugPort}`, "."], {
    cwd: desktopRoot,
    env: {
      ...process.env,
      SETTA_APP_DATA_DIR: fixture.appDataDir,
      SETTA_RECORD_INCLUDE_PAYLOADS: "1",
      SETTA_RECORD_SCREENSHOT_INTERVAL_MS: "0",
      SETTA_RECORDING: "1",
      SETTA_RECORDING_DIR: recordingDir,
      SETTA_TEST_CHAT_HARNESS: "scripted-workflow",
      SETTA_TEST_OPEN_WORKSPACE_ROOT: fixture.workspaceRoot,
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
  for (const path of expected.backendPaths) {
    if (
      !backend.some(
        (entry) =>
          entry.type === "backend_http_response" &&
          entry.status === 200 &&
          entry.url.includes(path),
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

main().catch((error) => {
  process.stderr.write(String(error instanceof Error ? error.message : error) + "\n");
  process.exitCode = 1;
});
