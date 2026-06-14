import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:net";
import { createReadStream, existsSync } from "node:fs";
import { appendFile, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

import { CDPClient, driverCallExpression } from "./cdp-client.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(scriptDir, "../..");
const pageLoadTimeoutMs = 20_000;
const sidebarWorkflowWorkspaceCount = 3000;
const workflowTimeoutMs = 15_000;
const shutdownTimeoutMs = 10_000;

export const liveWorkflowTimeoutMs = 120_000;

let launchVisible = false;

export function configureChatWorkflowHarness({ visible }) {
  launchVisible = Boolean(visible);
}

export async function waitForAssistantTextRendered(client, timeoutMs) {
  await waitForState(
    client,
    driverCallExpression("visibleAssistantTexts"),
    (value) => value.assistantTexts.length > 0,
    timeoutMs,
  );
}

export async function stopLaunchedContext(context) {
  if (!context) {
    return;
  }
  context.client?.close();
  await stopElectron(context.electron);
}

export async function openWorkspace(client, workspaceRoot, backend) {
  await waitForTexts(client, ["Shortcuts", "Projects"]);
  await clickButtonByAria(client, "Open project folder");
  await waitForTexts(client, ["workspace-root", "Start a conversation for this workspace."]);
  const session = await waitForBackendState(
    async () => backend.get("/workspace-session"),
    (value) => Boolean(value.selectedWorkspaceId),
  );
  return session.selectedWorkspaceId;
}

export async function createChat(client, backend, workspaceId) {
  await waitForRendererWorkspace(client, workspaceId);
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
  await waitForState(
    client,
    driverCallExpression("selectedConversation"),
    (value) => value.selectedConversationId === created.conversation.id,
  );
  return created.conversation.id;
}

async function waitForRendererWorkspace(client, workspaceId) {
  await waitForState(
    client,
    driverCallExpression("rendererWorkspace"),
    (value) => value.workspaceId === workspaceId,
  );
}

export async function submitComposer(client, text, buttonLabel) {
  await waitForComposerReady(client);
  await setInputValue(client, 'textarea[aria-label="Ask Setta"]', text);
  await clickButtonByAria(client, buttonLabel);
}

async function waitForComposerReady(client) {
  await waitForState(client, driverCallExpression("composerReady"), (value) => value.ready);
}

export async function setInputValue(client, selector, value) {
  const changed = await client.driver("setInputValue", { selector, value });
  if (!changed) {
    throw new Error(`input was not editable: ${selector}`);
  }
  await waitForState(
    client,
    driverCallExpression("elementValue", { selector }),
    (state) => state.value === value,
  );
}

export async function clickButtonByAria(client, label) {
  await clickWorkflowButton(client, "aria-label", label, `button was not clickable: ${label}`);
}

export async function clickButtonByText(client, text) {
  await clickWorkflowButton(client, "text", text, `button was not clickable: ${text}`);
}

export async function clickButtonContainingText(client, text) {
  await waitForState(
    client,
    buttonContainingTextClickExpression(text),
    (value) => value.clicked,
  ).catch((error) => {
    throw new Error(`button containing text was not clickable: ${text}: ${error.message}`);
  });
}

export async function scrollSidebarNavigationTo(client, scrollTop) {
  const scrolled = await client.driver("scrollSidebarNavigationTo", { scrollTop });
  if (!scrolled) {
    throw new Error("sidebar navigation list was not mounted");
  }
  await delay(100);
}

export async function sidebarMetrics(client) {
  return client.driver("sidebarMetrics");
}

async function clickWorkflowButton(client, kind, value, errorMessage) {
  await waitForState(client, buttonClickExpression(kind, value), (state) => state.clicked).catch(
    (error) => {
      throw new Error(`${errorMessage}: ${error.message}`);
    },
  );
}

function buttonClickExpression(kind, value) {
  return driverCallExpression("clickButton", { kind, value });
}

function buttonContainingTextClickExpression(text) {
  return driverCallExpression("clickButtonContainingText", { text });
}

export async function waitForText(client, text, timeoutMs = workflowTimeoutMs) {
  await waitForTexts(client, [text], timeoutMs);
}

export async function waitForTexts(client, texts, timeoutMs = workflowTimeoutMs) {
  await waitForState(
    client,
    driverCallExpression("bodyText"),
    (value) => texts.every((text) => value.body.includes(text)),
    timeoutMs,
  );
}

export async function assertTextAbsent(client, text) {
  const body = await client.driver("bodyText");
  if (body.body.includes(text)) {
    throw new Error(`unexpected rendered text: ${text}`);
  }
}

export async function waitForState(client, expression, isReady, timeoutMs = workflowTimeoutMs) {
  if (expression.startsWith("globalThis.__settaE2EDriver.")) {
    await client.installDriver();
  }
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

export async function backendProbe(recordingDir) {
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

export async function waitForBackendState(readState, isReady, timeoutMs = workflowTimeoutMs) {
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

export async function waitForRunWithPrompt(backend, workspaceId, conversationId, prompt, status) {
  return waitForBackendState(async () => {
    const list = await backend.post("/chat/runs/list", { conversationId, workspaceId });
    return (
      list.runs.find(
        (run) => run.promptSummary === prompt && (status === null || run.status === status),
      ) ?? null
    );
  }, Boolean);
}

export async function waitForRunStatus(backend, workspaceId, conversationId, runId, expected) {
  const { status, timeoutMs } =
    typeof expected === "string" ? { status: expected, timeoutMs: undefined } : expected;
  return waitForBackendState(
    async () => {
      const list = await backend.post("/chat/runs/list", { conversationId, workspaceId });
      return list.runs.find((run) => run.id === runId) ?? null;
    },
    (run) => run?.status === status,
    timeoutMs,
  );
}

export async function assertNoRunWithPrompt(backend, workspaceId, conversationId, prompt) {
  const list = await backend.post("/chat/runs/list", { conversationId, workspaceId });
  if (list.runs.some((run) => run.promptSummary === prompt)) {
    throw new Error(`slash command was recorded as a run prompt: ${prompt}`);
  }
}

export async function waitForCommandResult(
  backend,
  workspaceId,
  conversationId,
  expectedText,
  timeoutMs = workflowTimeoutMs,
) {
  return waitForBackendState(
    async () =>
      backend.post("/chat/messages/page", {
        conversationId,
        limit: 80,
        workspaceId,
      }),
    (page) =>
      page.messages.some(
        (message) => message.role === "command" && messageText(message).includes(expectedText),
      ),
    timeoutMs,
  );
}

export async function waitForLinkedCodexRef(
  backend,
  workspaceId,
  conversationId,
  timeoutMs = workflowTimeoutMs,
) {
  return waitForBackendState(
    async () => backend.post("/chat/conversations/list", { workspaceId }),
    (value) => {
      const item = value.conversations.find(
        (candidate) => candidate.conversation.id === conversationId,
      );
      return Boolean(
        item?.conversation.harnessRefs.some(
          (ref) => ref.harness === "codex" && ref.status === "linked" && ref.threadId !== "",
        ),
      );
    },
    timeoutMs,
  );
}

export async function waitForGoalStatus(
  backend,
  workspaceId,
  conversationId,
  status,
  timeoutMs = workflowTimeoutMs,
) {
  return waitForBackendState(
    async () =>
      backend.post("/chat/messages/page", {
        conversationId,
        limit: 80,
        workspaceId,
      }),
    (page) => (status === null ? page.goal === null : page.goal?.status === status),
    timeoutMs,
  );
}

export async function assertNoLinkedCodexRef(backend, workspaceId, conversationId) {
  const value = await backend.post("/chat/conversations/list", { workspaceId });
  const item = value.conversations.find(
    (candidate) => candidate.conversation.id === conversationId,
  );
  if (
    item?.conversation.harnessRefs.some(
      (ref) => ref.harness === "codex" && ref.status === "linked" && ref.threadId !== "",
    )
  ) {
    throw new Error(`conversation ${conversationId} unexpectedly has a linked codex ref`);
  }
}

export async function assertNoActiveRun(backend, workspaceId, conversationId) {
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

export async function assertRunsDrainedSequentially(backend, workspaceId, conversationId, runIds) {
  const list = await backend.post("/chat/runs/list", { conversationId, workspaceId });
  const runsById = new Map(list.runs.map((run) => [run.id, run]));
  const runs = runIds.map((runId) => {
    const run = runsById.get(runId);
    if (!run) {
      throw new Error(`run ${runId} was not returned by /chat/runs/list`);
    }
    return run;
  });
  for (const run of runs) {
    if (run.status !== "completed" || run.startedAt === "" || run.completedAt === "") {
      throw new Error(`run did not complete with timestamps: ${JSON.stringify(run)}`);
    }
  }
  for (let index = 1; index < runs.length; index += 1) {
    const previousCompletedAt = Date.parse(runs[index - 1].completedAt);
    const currentStartedAt = Date.parse(runs[index].startedAt);
    if (currentStartedAt < previousCompletedAt) {
      throw new Error(
        `queued run ${runs[index].id} started before ${runs[index - 1].id} completed: ${JSON.stringify(runs)}`,
      );
    }
  }
}

export async function assertTranscriptSequence(client, expectedTexts) {
  const value = await client.driver("chatTranscriptRows");
  let cursor = 0;
  for (const expected of expectedTexts) {
    const index = value.rows.findIndex((row, rowIndex) => {
      return rowIndex >= cursor && row.text.includes(expected);
    });
    if (index === -1) {
      throw new Error(
        `transcript did not contain ${expected} after index ${cursor}: ${JSON.stringify(value.rows)}`,
      );
    }
    cursor = index + 1;
  }
}

export async function assertNoVisibleUserMessage(client, text) {
  const value = await client.driver("visibleUserMessageTexts");
  const matches = value.rows.filter((rowText) => rowText.includes(text));
  if (matches.length > 0) {
    throw new Error(`found visible user message ${text}: ${JSON.stringify(value.rows)}`);
  }
}

export async function assertChatLayout(client) {
  const metrics = await client.driver("chatLayoutMetrics");
  if (!metrics.pane || !metrics.transcript || !metrics.composer) {
    throw new Error(`chat layout metrics missing required regions: ${JSON.stringify(metrics)}`);
  }
  if (metrics.transcript.height < 160 || metrics.scrollerClientHeight < 120) {
    throw new Error(`transcript region collapsed: ${JSON.stringify(metrics)}`);
  }
  if (metrics.transcript.bottom > metrics.composer.top + 1) {
    throw new Error(`transcript overlaps composer: ${JSON.stringify(metrics)}`);
  }
  if (metrics.composer.bottom > metrics.pane.bottom + 1) {
    throw new Error(`composer escapes chat pane: ${JSON.stringify(metrics)}`);
  }
}

export async function assertQueuedRunNotPromoted(
  backend,
  workspaceId,
  conversationId,
  { activeRunId, queuedRunId, terminalStatus },
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

export async function assertAssistantCompleted(backend, workspaceId, conversationId, runId) {
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

function messageText(message) {
  return message.parts.map((part) => part.text).join("");
}

export async function launchContext(fixture, recordingDir, options = {}) {
  await rm(recordingDir, { force: true, recursive: true });
  await mkdir(recordingDir, { recursive: true });
  const debugPort = await openPort();
  const electron = launchElectron(debugPort, fixture, recordingDir, options);
  const client = await connectToSettaPage(debugPort);
  await client.call("Runtime.enable");
  return { client, electron };
}

function launchElectron(debugPort, fixture, recordingDir, launchOptions = {}) {
  const harness = launchOptions.harness ?? "scripted-workflow";
  const extraEnv = launchOptions.extraEnv ?? {};
  const unsetEnv = launchOptions.unsetEnv ?? [];
  const e2eEnv = {
    SETTA_E2E: "1",
    SETTA_E2E_BLOCK_EXTERNAL_OPEN: "1",
    SETTA_E2E_OPEN_WORKSPACE_ROOT: fixture.workspaceRoot,
    ...(launchVisible ? { SETTA_E2E_VISIBLE: "1" } : {}),
    ...(harness === "scripted-workflow" ? { SETTA_E2E_CHAT_HARNESS: "scripted-workflow" } : {}),
  };
  const env = {
    ...process.env,
    ...extraEnv,
    ...e2eEnv,
    SETTA_APP_DATA_DIR: fixture.appDataDir,
    SETTA_RECORD_INCLUDE_PAYLOADS: "1",
    SETTA_RECORD_SCREENSHOT_INTERVAL_MS: "0",
    SETTA_RECORDING: "1",
    SETTA_RECORDING_DIR: recordingDir,
  };
  for (const name of unsetEnv) {
    delete env[name];
  }
  const electron = spawn(electronBin(), electronLaunchArgs(debugPort), {
    cwd: desktopRoot,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  electron.logs = [];
  collectProcessOutput(electron);
  return electron;
}

function electronLaunchArgs(debugPort) {
  return [
    `--remote-debugging-port=${debugPort}`,
    ".",
    ...(process.platform === "darwin" ? ["-ApplePersistenceIgnoreState", "YES"] : []),
  ];
}

export async function createFixture(name) {
  const tempRoot = await mkdtemp(join(tmpdir(), `setta-electron-${name}-`));
  const appDataDir = join(tempRoot, "app-data");
  const workspaceRoot = join(tempRoot, "workspace-root");
  await mkdir(appDataDir, { recursive: true });
  await mkdir(workspaceRoot, { recursive: true });
  return { appDataDir, tempRoot, workspaceRoot };
}

export async function createSidebarFixture(name) {
  const fixture = await createFixture(name);
  const activeRoot = join(fixture.tempRoot, "active-workspaces");
  const recentRoot = join(fixture.tempRoot, "recent-workspaces");
  await mkdir(activeRoot, { recursive: true });
  await mkdir(recentRoot, { recursive: true });

  const activeWorkspaces = [];
  const recentWorkspaces = [];
  for (let index = 0; index < sidebarWorkflowWorkspaceCount; index += 1) {
    activeWorkspaces.push(
      await createWorkspaceSummary(activeRoot, `active-workspace-${paddedIndex(index)}`, index),
    );
    recentWorkspaces.push(
      await createWorkspaceSummary(
        recentRoot,
        `recent-workspace-${paddedIndex(index)}`,
        sidebarWorkflowWorkspaceCount + index,
      ),
    );
  }

  const initialWorkspace = activeWorkspaces[0];
  const targetWorkspaceIndex = Math.floor(sidebarWorkflowWorkspaceCount / 2);
  const targetWorkspace = activeWorkspaces[targetWorkspaceIndex];
  const recentWorkspace = recentWorkspaces.at(-1);
  if (!initialWorkspace || !targetWorkspace || !recentWorkspace) {
    throw new Error("sidebar fixture did not create required workspaces");
  }

  await writeFile(
    join(fixture.appDataDir, "app-state.json"),
    JSON.stringify(
      {
        activeWorkspaceIds: activeWorkspaces.map((workspace) => workspace.id),
        recentWorkspaces: [...activeWorkspaces, ...recentWorkspaces],
        schemaVersion: 1,
        selectedWorkspaceId: initialWorkspace.id,
      },
      null,
      2,
    ) + "\n",
  );

  return {
    ...fixture,
    activeWorkspaces,
    initialWorkspace,
    recentWorkspace,
    sidebarRowHeight: 28,
    targetWorkspace,
    targetWorkspaceIndex,
  };
}

export async function createTwoWorkspaceFixture(name) {
  const fixture = await createFixture(name);
  const activeRoot = join(fixture.tempRoot, "two-active-workspaces");
  await mkdir(activeRoot, { recursive: true });
  const firstWorkspace = await createWorkspaceSummary(activeRoot, "first-workspace", 0);
  const secondWorkspace = await createWorkspaceSummary(activeRoot, "second-workspace", 1);

  await writeFile(
    join(fixture.appDataDir, "app-state.json"),
    JSON.stringify(
      {
        activeWorkspaceIds: [firstWorkspace.id, secondWorkspace.id],
        recentWorkspaces: [firstWorkspace, secondWorkspace],
        schemaVersion: 1,
        selectedWorkspaceId: firstWorkspace.id,
      },
      null,
      2,
    ) + "\n",
  );

  return {
    ...fixture,
    firstWorkspace,
    secondWorkspace,
  };
}

async function createWorkspaceSummary(parent, name, timestampOffsetSeconds) {
  const root = join(parent, name);
  await mkdir(root, { recursive: true });
  const canonicalRoot = await realpath(root);
  return {
    displayName: name,
    id: workspaceID(canonicalRoot),
    lastOpenedAt: new Date(
      Date.UTC(2026, 4, 29, 20, 0, 0) + timestampOffsetSeconds * 1000,
    ).toISOString(),
    rootPath: canonicalRoot,
  };
}

function workspaceID(rootPath) {
  return "workspace_" + createHash("sha256").update(rootPath).digest("hex").slice(0, 32);
}

function paddedIndex(index) {
  return String(index).padStart(4, "0");
}

export function assertBuildExists() {
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
        return CDPClient.connect(page.webSocketDebuggerUrl, pageLoadTimeoutMs);
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

export async function stopElectron(child) {
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

export async function captureScreenshot(client, path) {
  if (!client) {
    return;
  }
  await mkdir(dirname(path), { recursive: true });
  await requestRendererLayoutSnapshot(client, "workflow_screenshot");
  const image = await client.call("Page.captureScreenshot", { format: "png" });
  await writeFile(path, Buffer.from(image.data, "base64"));
}

async function requestRendererLayoutSnapshot(client, trigger) {
  if (!client) {
    return;
  }
  await client.driver("dispatchLayoutSnapshot", { trigger });
  await delay(25);
}

export function failureWithLogs(error, logs) {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(`${message}\nElectron output:\n${logs.join("")}`);
}

export async function assertRecordingEvidence(recordingDir, expected) {
  await assertNoIpcFailures(recordingDir);
  await assertLayoutSnapshotsRecorded(recordingDir);
  await assertIpcChannels(recordingDir, expected.ipcChannels);
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

async function assertIpcChannels(recordingDir, expectedChannels) {
  const missing = new Set(expectedChannels);
  await scanJsonLines(join(recordingDir, "ipc.jsonl"), (entry) => {
    if (entry.type === "ipc_finish" && missing.has(entry.channel)) {
      missing.delete(entry.channel);
    }
    return missing.size > 0;
  });
  if (missing.size > 0) {
    throw new Error(`recording missing successful IPC channels: ${Array.from(missing).join(", ")}`);
  }
}

async function assertLayoutSnapshotsRecorded(recordingDir) {
  const snapshots = await waitForLayoutSnapshots(recordingDir);
  if (snapshots.length === 0) {
    throw new Error(`recording missing renderer layout snapshots: ${recordingDir}`);
  }
  if (!snapshots.some((entry) => entry.chatDetailPane && entry.composer)) {
    throw new Error(`recording layout snapshots never captured chat regions: ${recordingDir}`);
  }
}

async function waitForLayoutSnapshots(recordingDir) {
  const path = join(recordingDir, "renderer-events.jsonl");
  const startedAt = Date.now();
  let snapshots = [];
  while (Date.now() - startedAt < 2_000) {
    const rendererEvents = await readJsonLines(path);
    snapshots = rendererEvents.filter((entry) => entry.type === "layout_snapshot");
    if (snapshots.some((entry) => entry.chatDetailPane && entry.composer)) {
      return snapshots;
    }
    await delay(50);
  }
  return snapshots;
}

async function assertNoIpcFailures(recordingDir) {
  const failures = [];
  await scanJsonLines(join(recordingDir, "ipc.jsonl"), (entry) => {
    if (entry.type === "ipc_failure" && !isExpectedInitialTerminalAttachMiss(entry)) {
      failures.push(entry);
    }
    return failures.length < 20;
  });
  if (failures.length > 0) {
    throw new Error(
      `recording included IPC failures: ${JSON.stringify(failures)}${
        failures.length === 20 ? " (showing first 20)" : ""
      }`,
    );
  }
}

function isExpectedInitialTerminalAttachMiss(entry) {
  return (
    entry.channel === "terminal:attach" &&
    typeof entry.error?.message === "string" &&
    entry.error.message.includes("terminal session not found")
  );
}

async function readJsonLines(path) {
  const content = await readFile(path, "utf8");
  return content
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line));
}

async function scanJsonLines(path, visit) {
  const stream = createReadStream(path, { encoding: "utf8" });
  const lines = createInterface({ crlfDelay: Infinity, input: stream });
  for await (const line of lines) {
    if (line.trim() === "") {
      continue;
    }
    const shouldContinue = await visit(JSON.parse(line));
    if (!shouldContinue) {
      lines.close();
      stream.destroy();
      return;
    }
  }
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

export async function appendWorkflowState(recordingDir, value) {
  await mkdir(recordingDir, { recursive: true });
  await appendFile(join(recordingDir, "workflow-state.jsonl"), JSON.stringify(value) + "\n");
}

export function pathTimestamp() {
  return new Date().toISOString().replaceAll(":", "").replaceAll(".", "-");
}
