import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:net";
import { existsSync } from "node:fs";
import { appendFile, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
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

let launchVisible = false;

export function configureElectronWorkflowHarness({ visible }) {
  launchVisible = Boolean(visible);
}

export async function stopLaunchedContext(context) {
  if (!context) {
    return;
  }
  context.client?.close();
  await stopElectron(context.electron);
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
  const { baseURL, deviceToken } = await waitForBackendAccess(recordingDir);
  await writeFile(join(recordingDir, "backend-url.txt"), baseURL + "\n");
  return {
    baseURL,
    deviceToken,
    get: (path) => backendRequest(recordingDir, baseURL, deviceToken, "GET", path),
    post: (path, payload) =>
      backendRequest(recordingDir, baseURL, deviceToken, "POST", path, payload),
    request: (method, path, payload) =>
      backendFetch(recordingDir, baseURL, deviceToken, method, path, payload),
  };
}

async function backendRequest(recordingDir, baseURL, deviceToken, method, path, payload) {
  const response = await backendFetch(recordingDir, baseURL, deviceToken, method, path, payload);
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`${method} ${path} returned ${response.status}: ${body}`);
  }
  return JSON.parse(body);
}

async function backendFetch(recordingDir, baseURL, deviceToken, method, path, payload) {
  const response = await globalThis.fetch(baseURL + path, {
    body: payload === undefined ? undefined : JSON.stringify(payload),
    headers: backendRequestHeaders(deviceToken, payload),
    method,
  });
  await appendWorkflowState(recordingDir, {
    method,
    ok: response.ok,
    path,
    status: response.status,
    type: "backend_request",
  });
  return response;
}

function backendRequestHeaders(deviceToken, payload) {
  return {
    Authorization: "Bearer " + deviceToken,
    ...(payload === undefined ? {} : { "Content-Type": "application/json" }),
  };
}

async function waitForBackendAccess(recordingDir) {
  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt < pageLoadTimeoutMs) {
    try {
      const access = await readBackendAccess(recordingDir);
      if (access) {
        return access;
      }
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  throw new Error(`backend access was not recorded: ${lastError?.message ?? "timed out"}`);
}

async function readBackendAccess(recordingDir) {
  const events = await readJsonLines(join(recordingDir, "events.jsonl"));
  const baseURL = backendURLFromEvents(events);
  if (baseURL === null) {
    return null;
  }
  const manifest = JSON.parse(await readFile(join(recordingDir, "manifest.json"), "utf8"));
  const appDataDir = nonEmptyString(manifest?.appDataDir) ? manifest.appDataDir : null;
  if (appDataDir === null) {
    return null;
  }
  const registryPath = join(appDataDir, "electron-user-data", "known-runtimes.json");
  const registry = JSON.parse(await readFile(registryPath, "utf8"));
  const deviceToken = localRuntimeDeviceToken(registry, baseURL);
  return deviceToken === null ? null : { baseURL, deviceToken };
}

function backendURLFromEvents(events) {
  const started = events.find((entry) => entry.type === "backend_started");
  const url = started?.payload?.url;
  return nonEmptyString(url) ? url : null;
}

function localRuntimeDeviceToken(registry, baseURL) {
  const localRuntime = registry?.runtimes?.find(
    (runtime) => runtime?.is_local === true && runtime.base_url === baseURL,
  );
  const deviceToken = localRuntime?.device_token;
  return nonEmptyString(deviceToken) ? deviceToken : null;
}

function nonEmptyString(value) {
  return typeof value === "string" && value !== "";
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
  const extraEnv = launchOptions.extraEnv ?? {};
  const unsetEnv = launchOptions.unsetEnv ?? [];
  const e2eEnv = {
    SETTA_E2E: "1",
    SETTA_BACKEND_READY_TIMEOUT_MS: "30000",
    SETTA_E2E_BLOCK_EXTERNAL_OPEN: "1",
    SETTA_E2E_OPEN_WORKSPACE_ROOT: fixture.workspaceRoot,
    ...(launchVisible ? { SETTA_E2E_VISIBLE: "1" } : {}),
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
  // Exercise speech playback without sending test audio to the host speakers.
  const electron = spawn(
    electronBin(),
    [`--remote-debugging-port=${debugPort}`, "--mute-audio", "."],
    {
      cwd: desktopRoot,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  electron.logs = [];
  collectProcessOutput(electron);
  return electron;
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

async function readJsonLines(path) {
  const content = await readFile(path, "utf8");
  return content
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line));
}

export async function appendWorkflowState(recordingDir, value) {
  await mkdir(recordingDir, { recursive: true });
  await appendFile(join(recordingDir, "workflow-state.jsonl"), JSON.stringify(value) + "\n");
}

export function pathTimestamp() {
  return new Date().toISOString().replaceAll(":", "").replaceAll(".", "-");
}
