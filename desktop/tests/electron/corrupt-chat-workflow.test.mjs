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
const desktopRoot = resolve(scriptDir, "../..");
const repoRoot = resolve(desktopRoot, "..");
const options = parseArgs(process.argv.slice(2));
const recordingDir = corruptChatRecordingDir(options);
const pageLoadTimeoutMs = 20_000;
const workflowTimeoutMs = 10_000;
const shutdownTimeoutMs = 10_000;
const workspaceId = "workspace_electron_corrupt_chat";
const validConversationId = "conversation_valid_history";
const secondValidConversationId = "conversation_second_valid";
const conversationId = "conversation_corrupt_history";
const runId = "run_missing_assistant_message";
const validRunId = "run_valid_history";

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
  let context = null;
  let failure = null;

  try {
    context = await launchCorruptContext(fixture.appDataDir);
    await waitForPartialCorruptChatState(context.client);
    await assertWarningTooltips(context.client);
    await openCorruptConversation(context.client);
    await submitComposer(context.client, "resilient prompt", "Send message");
    await waitForTexts(context.client, ["resilient prompt", "Scripted response: resilient prompt"]);
    await waitForCorruptionStatus(context.client, "corrupt chat");
    await assertRepairControlsAbsent(context.client);
    await clickNewChat(context.client);
    await waitForUsableNewChat(context.client);
    await waitForCorruptionStatus(context.client, "corrupt chat");
    await captureScreenshot(context.client, join(recordingDir, "after-new-chat.png"));
    await stopLaunchedContext(context);
    context = null;

    context = await launchCorruptContext(fixture.appDataDir);
    await waitForTexts(context.client, ["New chat"]);
    await waitForCorruptionStatus(context.client, "corrupt chat");
    await assertRepairControlsAbsent(context.client);
    await captureScreenshot(context.client, join(recordingDir, "after-restart.png"));
  } catch (error) {
    failure = error;
    await captureScreenshot(context?.client, join(recordingDir, "failure.png")).catch(() => {});
  } finally {
    await stopLaunchedContext(context);
    await rm(tempRoot, { force: true, recursive: true });
  }

  if (failure) {
    throw failureWithLogs(failure, context?.electron.logs ?? []);
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
  const validUpdatedAt = "2026-05-31T01:03:00Z";
  const secondUpdatedAt = "2026-05-31T01:02:00Z";
  const workspaceSummary = {
    displayName: "corrupt-chat-workspace",
    id: workspaceId,
    lastOpenedAt: now,
    rootPath: workspaceRoot,
  };
  await mkdir(join(workspaceDir, "conversations", validConversationId, "messages"), {
    recursive: true,
  });
  await mkdir(join(workspaceDir, "conversations", secondValidConversationId), {
    recursive: true,
  });
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
  await writeJson(join(workspaceDir, "conversations", validConversationId, "conversation.json"), {
    archivedAt: "",
    codexEffectiveSettings: null,
    codexSettings: null,
    createdAt: now,
    harnessRefs: [],
    id: validConversationId,
    schemaVersion: 1,
    title: "Valid historical chat",
    updatedAt: validUpdatedAt,
    workspaceId,
  });
  await writeJson(
    join(
      workspaceDir,
      "conversations",
      validConversationId,
      "messages",
      "000000000001_message_valid_user.json",
    ),
    {
      conversationId: validConversationId,
      createdAt: validUpdatedAt,
      delivery: "normal",
      id: "message_valid_user",
      ordinal: 1,
      parts: [
        { format: "plain", id: "part_valid_user", text: "persisted valid message", type: "text" },
      ],
      role: "user",
      runId: validRunId,
      schemaVersion: 1,
      status: "complete",
      updatedAt: validUpdatedAt,
    },
  );
  await writeJson(
    join(
      workspaceDir,
      "conversations",
      validConversationId,
      "messages",
      "000000000002_message_valid_assistant.json",
    ),
    {
      conversationId: validConversationId,
      createdAt: validUpdatedAt,
      delivery: "normal",
      id: "message_valid_assistant",
      ordinal: 2,
      parts: [
        {
          format: "markdown",
          id: "part_valid_assistant",
          text: "persisted valid response",
          type: "text",
        },
      ],
      role: "assistant",
      runId: validRunId,
      schemaVersion: 1,
      status: "complete",
      updatedAt: validUpdatedAt,
    },
  );
  await writeJson(join(workspaceDir, "runs", `${validRunId}.json`), {
    assistantMessageId: "message_valid_assistant",
    completedAt: validUpdatedAt,
    conversationId: validConversationId,
    error: "",
    harness: "codex",
    id: validRunId,
    pendingApproval: null,
    promptSummary: "persisted valid message",
    schemaVersion: 1,
    startedAt: now,
    status: "completed",
    triggerMessageId: "message_valid_user",
    workspaceId,
  });
  await writeJson(
    join(workspaceDir, "conversations", secondValidConversationId, "conversation.json"),
    {
      archivedAt: "",
      codexEffectiveSettings: null,
      codexSettings: null,
      createdAt: now,
      harnessRefs: [],
      id: secondValidConversationId,
      schemaVersion: 1,
      title: "Second valid chat",
      updatedAt: secondUpdatedAt,
      workspaceId,
    },
  );
  await writeJson(join(workspaceDir, "conversations", conversationId, "conversation.json"), {
    archivedAt: "",
    codexEffectiveSettings: null,
    codexSettings: null,
    createdAt: now,
    harnessRefs: [],
    id: conversationId,
    schemaVersion: 1,
    title: "Corrupt historical chat",
    updatedAt: now,
    workspaceId,
  });
  await writeJson(join(workspaceDir, "runs", `${runId}.json`), {
    assistantMessageId: "message_missing_assistant",
    completedAt: "2026-05-31T01:01:00Z",
    conversationId,
    error: "",
    harness: "codex",
    id: runId,
    pendingApproval: {
      createdAt: now,
      id: "approval_stale",
      kind: "permission",
      runId,
      status: "pending",
      title: "Stale approval",
    },
    promptSummary: "historical corrupt turn",
    schemaVersion: 1,
    startedAt: now,
    status: "completed",
    triggerMessageId: "message_trigger",
    workspaceId,
  });
  return { appDataDir, workspaceRoot };
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
      SETTA_E2E_CHAT_HARNESS: "scripted-workflow",
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

async function launchCorruptContext(appDataDir) {
  const debugPort = await openPort();
  const electron = launchElectron(debugPort, appDataDir);
  const client = await connectToSettaPage(debugPort);
  await client.call("Runtime.enable");
  await installPageHelpers(client);
  await client.evaluate("window.confirm = () => true");
  await pauseWorkspaceBenchmarkForChatWorkflow(client);
  return { client, electron };
}

async function stopLaunchedContext(context) {
  if (!context) {
    return;
  }
  context.client?.close();
  await stopElectron(context.electron);
}

async function installPageHelpers(client) {
  await client.evaluate(`(() => {
    window.findWorkflowButton = (kind, expected) => {
      const buttons = Array.from(document.querySelectorAll("button"));
      return buttons.find((button) => {
        if (kind === "aria-label") {
          return button.getAttribute("aria-label") === expected;
        }
        return button.innerText.trim().includes(expected);
      }) ?? null;
    };
  })()`);
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

async function waitForPartialCorruptChatState(client) {
  const state = await waitForState(
    client,
    partialCorruptChatStateExpression(),
    (value) => value.ready,
  );
  if (state.newChatDisabled) {
    throw new Error(`New chat is disabled with partial corrupt state: ${state.body}`);
  }
}

async function pauseWorkspaceBenchmarkForChatWorkflow(client) {
  let lastState = null;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await dispatchWorkspaceArrowKey(client, "ArrowLeft");
    const state = await waitForWorkspaceChatSurfaceReady(client, 1_200);
    if (state.ready) {
      return;
    }
    lastState = state.value;
  }
  throw new Error(
    `workspace chat surface was not ready after navigation: ${JSON.stringify(lastState)}`,
  );
}

async function dispatchWorkspaceArrowKey(client, key) {
  await client.evaluate(`(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: ${JSON.stringify(key)},
    }));
  })()`);
}

async function waitForWorkspaceChatSurfaceReady(client, timeoutMs) {
  const startedAt = Date.now();
  let lastValue = null;
  while (Date.now() - startedAt < timeoutMs) {
    lastValue = await client.evaluate(workspaceChatSurfaceReadyExpression());
    if (workspaceChatSurfaceReady(lastValue)) {
      return { ready: true, value: lastValue };
    }
    await delay(100);
  }
  return { ready: false, value: lastValue };
}

function workspaceChatSurfaceReady(value) {
  return (
    !value.workspaceMounted ||
    (value.chatMounted &&
      value.hostRuntimeState === "live" &&
      value.hostMoving === "false" &&
      value.hostVisible === "true")
  );
}

function workspaceChatSurfaceReadyExpression() {
  return `(() => {
    const workspace = document.querySelector('[data-testid="workspace-layout-area"]');
    const chatSurface = document.querySelector('[data-testid="workspace-chat-dom-surface"]');
    const host = chatSurface?.closest('[data-testid="workspace-pane-host"]');
    return {
      chatMounted: Boolean(document.querySelector('[data-testid="chat-detail-pane"]')),
      hostMoving: host?.getAttribute("data-moving") ?? "",
      hostRuntimeState: host?.getAttribute("data-runtime-state") ?? "",
      hostVisible: host?.getAttribute("data-visible") ?? "",
      workspaceMounted: Boolean(workspace),
    };
  })()`;
}

function partialCorruptChatStateExpression() {
  return `(() => {
    const button = document.querySelector('button[aria-label="New chat"]');
    const sidebar = document.querySelector('[data-testid="sidebar-scrollable-sections"]');
    const detail = document.querySelector('[data-testid="chat-detail-pane"]');
    const status = document.querySelector('[data-testid="workspace-corruption-status"]');
    const statusLabel = status?.getAttribute("aria-label") ?? "";
    const conversations = Array.from(document.querySelectorAll('[data-testid="conversation-list-item"]'));
    const corruptConversation = conversations.find((conversation) =>
      conversation.innerText.includes("Corrupt historical chat")
    );
    const conversationStatus = corruptConversation?.querySelector(
      '[data-testid="conversation-corruption-status"]'
    );
    const conversationStatusLabel = conversationStatus?.getAttribute("aria-label") ?? "";
    const body = document.body.innerText;
    return {
      body,
      conversationCount: conversations.length,
      conversationStatusLabel,
      newChatDisabled: button ? button.disabled : null,
      statusLabel,
      ready: Boolean(
        button &&
        status &&
        sidebar?.contains(status) &&
        !detail?.contains(status) &&
        statusLabel.includes("corrupt chat") &&
        conversationStatus &&
        conversationStatusLabel.includes("has pendingApproval while status is completed") &&
        conversations.length >= 3 &&
        body.includes("Valid historical chat") &&
        body.includes("Second valid chat") &&
        body.includes("Corrupt historical chat") &&
        body.includes("persisted valid message") &&
        !body.includes("Chat state needs attention") &&
        !body.includes("Chat state is corrupt")
      ),
    };
  })()`;
}

async function openCorruptConversation(client) {
  await clickButtonByText(client, "Corrupt historical chat");
  await waitForCorruptionStatus(client, "has pendingApproval while status is completed");
  await waitForTexts(client, ["persisted valid message"]);
}

async function assertWarningTooltips(client) {
  await hoverElement(client, '[data-testid="workspace-corruption-status"]');
  await waitForState(client, visibleWorkspaceWarningExpression(), (value) => value.ready);
  await hoverElement(client, '[data-testid="conversation-corruption-status"]');
  await waitForState(client, visibleConversationWarningExpression(), (value) => value.ready);
}

async function hoverElement(client, selector) {
  const point = await client.evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) {
      return null;
    }
    const rect = element.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  })()`);
  if (!point) {
    throw new Error(`element was not available to hover: ${selector}`);
  }
  await client.call("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: point.x,
    y: point.y,
  });
  await delay(50);
}

function visibleWorkspaceWarningExpression() {
  return `(() => {
    const tooltip = document.querySelector('[data-testid="workspace-corruption-tooltip"]');
    const text = tooltip?.innerText ?? "";
    const style = tooltip ? window.getComputedStyle(tooltip) : null;
    return {
      display: style?.display ?? "",
      text,
      ready: Boolean(
        tooltip &&
        style?.display !== "none" &&
        text.includes("Malformed chat data") &&
        text.includes("corrupt chat")
      ),
    };
  })()`;
}

function visibleConversationWarningExpression() {
  return `(() => {
    const cards = Array.from(document.querySelectorAll('[data-testid="conversation-hover-card"]'));
    const visible = cards.find((card) => window.getComputedStyle(card).display !== "none");
    const rect = visible?.getBoundingClientRect();
    const text = visible?.innerText ?? "";
    return {
      bottom: rect?.bottom ?? null,
      text,
      top: rect?.top ?? null,
      ready: Boolean(
        visible &&
        rect &&
        rect.top >= 0 &&
        rect.bottom <= window.innerHeight &&
        text.includes("Corrupt historical chat") &&
        text.includes("Malformed chat data") &&
        text.includes("has pendingApproval while status is completed")
      ),
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

async function submitComposer(client, text, buttonLabel) {
  await waitForComposerReady(client);
  await setInputValue(client, 'textarea[aria-label="Ask Setta"]', text);
  await clickButtonByAria(client, buttonLabel);
}

async function waitForComposerReady(client) {
  await waitForState(client, composerReadyExpression(), (value) => value.ready);
}

function composerReadyExpression() {
  return `(() => {
    const textarea = document.querySelector('textarea[aria-label="Ask Setta"]');
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

async function clickButtonByText(client, text) {
  await waitForState(client, buttonStateExpression("text", text), (value) => value.ready);
  const clicked = await client.evaluate(buttonClickExpression("text", text));
  if (!clicked) {
    throw new Error(`button was not clickable: ${text}`);
  }
}

async function clickButtonByAria(client, label) {
  await waitForState(client, buttonStateExpression("aria-label", label), (value) => value.ready);
  const clicked = await client.evaluate(buttonClickExpression("aria-label", label));
  if (!clicked) {
    throw new Error(`button was not clickable: ${label}`);
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

async function waitForUsableNewChat(client) {
  const state = await waitForState(client, usableNewChatExpression(), (value) => value.ready);
  if (state.textareaDisabled) {
    throw new Error(`composer stayed disabled after New Chat: ${state.body}`);
  }
}

function usableNewChatExpression() {
  return `(() => {
    const textarea = document.querySelector('textarea[aria-label="Ask Setta"]');
    const conversations = Array.from(document.querySelectorAll('[data-testid="conversation-list-item"]'));
    const body = document.body.innerText;
    return {
      body,
      conversationCount: conversations.length,
      ready: Boolean(textarea && !textarea.disabled && conversations.length >= 4 && body.includes("New chat")),
      textareaDisabled: textarea ? textarea.disabled : null,
    };
  })()`;
}

async function waitForTexts(client, texts) {
  await waitForState(client, bodyTextExpression(), (value) =>
    texts.every((text) => value.body.includes(text)),
  );
}

function bodyTextExpression() {
  return `(() => ({ body: document.body.innerText }))()`;
}

async function waitForCorruptionStatus(client, expectedText) {
  await waitForState(client, corruptionStatusExpression(expectedText), (value) => value.ready);
}

function corruptionStatusExpression(expectedText) {
  return `(() => {
    const sidebar = document.querySelector('[data-testid="sidebar-scrollable-sections"]');
    const detail = document.querySelector('[data-testid="chat-detail-pane"]');
    const status = document.querySelector('[data-testid="workspace-corruption-status"]');
    const label = status?.getAttribute("aria-label") ?? "";
    return {
      label,
      ready: Boolean(
        status &&
        sidebar?.contains(status) &&
        !detail?.contains(status) &&
        label.includes(${JSON.stringify(expectedText)})
      ),
    };
  })()`;
}

async function assertRepairControlsAbsent(client) {
  const state = await client.evaluate(`(() => {
    const buttons = Array.from(document.querySelectorAll("button"));
    const labels = buttons.map((button) =>
      [button.innerText.trim(), button.getAttribute("aria-label") ?? ""].join(" "),
    );
    return {
      labels,
      hasRepairControl: labels.some((label) =>
        label.includes("Quarantine") ||
        label.includes("Reset workspace chat state") ||
        label.includes("Clear chat quarantine")
      ),
    };
  })()`);
  if (state.hasRepairControl) {
    throw new Error(`repair controls should not be exposed: ${JSON.stringify(state.labels)}`);
  }
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
  const listFinish = ipc.find(
    (entry) =>
      entry.type === "ipc_finish" &&
      entry.channel === "chat:list-conversations" &&
      entry.result?.corruption?.total > 0,
  );
  if (!listFinish) {
    throw new Error("recording did not include a partial chat:list-conversations result");
  }
  const maintenanceCall = ipc.find(
    (entry) =>
      (entry.type === "ipc_start" || entry.type === "ipc_finish") &&
      (entry.channel === "chat:quarantine-corrupt-state" ||
        entry.channel === "chat:reset-workspace-state" ||
        entry.channel === "chat:clear-quarantine"),
  );
  if (maintenanceCall) {
    throw new Error(`recording included removed chat maintenance IPC: ${maintenanceCall.channel}`);
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
