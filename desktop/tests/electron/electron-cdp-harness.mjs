import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

import { CDPClient } from "./cdp-client.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
export const desktopRoot = resolve(scriptDir, "../..");
export const repoRoot = resolve(desktopRoot, "..");
const pageLoadTimeoutMs = 20_000;
const stateWaitTimeoutMs = 15_000;
const shutdownTimeoutMs = 10_000;
const electronHarnessArgHandlers = {
  "--artifact-dir": (options, argv, index) => {
    const value = argv[index + 1];
    if (!value) {
      throw new Error("--artifact-dir requires a value");
    }
    options.artifactDir = resolve(value);
    return 1;
  },
  "--keep-artifacts": (options) => {
    options.keepArtifacts = true;
    return 0;
  },
  "--skip-build": (options) => {
    options.skipBuild = true;
    return 0;
  },
  "--trace": (options) => {
    options.trace = true;
    return 0;
  },
  "--visible": (options) => {
    options.visible = true;
    return 0;
  },
  "-h": (options) => {
    options.help = true;
    return 0;
  },
  "--help": (options) => {
    options.help = true;
    return 0;
  },
};

export function parseElectronHarnessArgs(argv) {
  const options = {
    artifactDir: "",
    keepArtifacts: false,
    skipBuild: false,
    trace: false,
    visible: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const handleArg = electronHarnessArgHandlers[arg];
    if (!handleArg) {
      throw new Error(`Unknown Electron harness argument: ${arg}`);
    }
    index += handleArg(options, argv, index);
  }
  return options;
}

export function timestampedRecordingDir(name) {
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.(\d+)Z$/, "$1Z");
  return join(repoRoot, ".recordings", name, timestamp);
}

export async function writeLatestRecordingPointer(name, artifactDir) {
  const recordingRoot = join(repoRoot, ".recordings", name);
  const latestPath = join(recordingRoot, "latest");
  await mkdir(recordingRoot, { recursive: true });
  await rm(latestPath, { force: true, recursive: true });
  try {
    await symlink(artifactDir, latestPath, "dir");
  } catch (error) {
    if (!error || error.code !== "EEXIST") {
      throw error;
    }
    await rm(latestPath, { force: true, recursive: true });
    await symlink(artifactDir, latestPath, "dir");
  }
  await writeJson(join(recordingRoot, "latest.json"), {
    artifactDir,
    debugPortFile: join(artifactDir, "debug-port.txt"),
    updatedAt: new Date().toISOString(),
  });
}

export async function createElectronFixture(name) {
  const tempRoot = await mkdtemp(join(tmpdir(), `setta-electron-${name}-`));
  const appDataDir = join(tempRoot, "app-data");
  const workspaceRoot = join(tempRoot, "workspace-root");
  await mkdir(appDataDir, { recursive: true });
  await mkdir(workspaceRoot, { recursive: true });
  return { appDataDir, tempRoot, workspaceRoot };
}

export async function launchElectronCdpContext({
  artifactDir,
  electronArgs = [],
  extraEnv = {},
  fixture,
  unsetEnv = [],
  visible = false,
}) {
  await rm(artifactDir, { force: true, recursive: true });
  await mkdir(artifactDir, { recursive: true });
  const debugPort = await openPort();
  await writeFile(join(artifactDir, "debug-port.txt"), `${debugPort}\n`);
  const electron = launchElectron({
    artifactDir,
    debugPort,
    electronArgs,
    extraEnv,
    fixture,
    unsetEnv,
    visible,
  });
  const client = await connectToSettaPage(debugPort);
  await client.call("Runtime.enable");
  await client.call("Page.enable");
  return { artifactDir, client, debugPort, electron, fixture };
}

export async function stopElectronCdpContext(context) {
  if (!context) {
    return;
  }
  context.client?.close();
  await writeElectronOutput(context);
  await stopElectron(context.electron);
}

export function assertBuildExists() {
  const mainPath = join(desktopRoot, "out", "main", "index.js");
  if (!existsSync(mainPath)) {
    throw new Error(`desktop build is missing: ${mainPath}. Run pnpm -C desktop build first.`);
  }
}

export async function waitForState(client, expression, isReady, timeoutMs = stateWaitTimeoutMs) {
  const startedAt = Date.now();
  let lastError = null;
  let lastValue = null;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      lastValue = await client.evaluate(expression);
    } catch (error) {
      if (!isPageNavigationTransient(error)) {
        throw error;
      }
      lastError = error;
      await delay(100);
      continue;
    }
    if (isReady(lastValue)) {
      return lastValue;
    }
    await delay(100);
  }
  const errorMessage = lastError instanceof Error ? ` lastError=${lastError.message}` : "";
  throw new Error(
    `timed out waiting for Electron CDP state: ${JSON.stringify(lastValue)}${errorMessage}`,
  );
}

export async function waitForSelector(client, selector, timeoutMs = stateWaitTimeoutMs) {
  await waitForState(
    client,
    `(() => ({ ready: Boolean(document.querySelector(${JSON.stringify(selector)})) }))()`,
    (value) => value.ready,
    timeoutMs,
  );
}

export async function clickEnabledButtonByAria(client, label, timeoutMs = stateWaitTimeoutMs) {
  await waitForState(
    client,
    enabledButtonByAriaExpression(label),
    (value) => value.ready,
    timeoutMs,
  );
  const clicked = await client.evaluate(`(() => {
    const button = Array.from(document.querySelectorAll("button")).find(
      (candidate) => candidate.getAttribute("aria-label") === ${JSON.stringify(label)}
    );
    if (!(button instanceof HTMLButtonElement)) {
      return { ok: false, reason: "missing-button" };
    }
    if (button.disabled) {
      return { ok: false, reason: "disabled-button" };
    }
    button.click();
    return { ok: true };
  })()`);
  if (!clicked.ok) {
    throw new Error(`button was not clickable: ${label}: ${JSON.stringify(clicked)}`);
  }
}

function enabledButtonByAriaExpression(label) {
  return `(() => {
    const button = Array.from(document.querySelectorAll("button")).find(
      (candidate) => candidate.getAttribute("aria-label") === ${JSON.stringify(label)}
    );
    if (!(button instanceof HTMLButtonElement)) {
      return { ready: false, reason: "missing-button" };
    }
    return { ready: !button.disabled, reason: button.disabled ? "disabled-button" : "ready" };
  })()`;
}

export async function captureScreenshot(client, path) {
  await mkdir(dirname(path), { recursive: true });
  const image = await client.call("Page.captureScreenshot", { format: "png" });
  await writeFile(path, Buffer.from(image.data, "base64"));
}

export async function reloadPage(client) {
  try {
    await client.call("Page.reload", { ignoreCache: true });
  } catch (error) {
    if (!isPageNavigationTransient(error)) {
      throw error;
    }
  }
}

export async function dispatchMouseDrag(client, { from, modifiers = 0, steps = 12, to }) {
  await client.call("Input.dispatchMouseEvent", {
    button: "none",
    modifiers,
    type: "mouseMoved",
    x: from.x,
    y: from.y,
  });
  await client.call("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 1,
    clickCount: 1,
    modifiers,
    type: "mousePressed",
    x: from.x,
    y: from.y,
  });
  for (let step = 1; step <= steps; step += 1) {
    const progress = step / steps;
    await client.call("Input.dispatchMouseEvent", {
      button: "left",
      buttons: 1,
      modifiers,
      type: "mouseMoved",
      x: from.x + (to.x - from.x) * progress,
      y: from.y + (to.y - from.y) * progress,
    });
    await delay(16);
  }
  await client.call("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 0,
    clickCount: 1,
    modifiers,
    type: "mouseReleased",
    x: to.x,
    y: to.y,
  });
}

export async function dispatchMouseClick(client, { modifiers = 0, x, y }) {
  await client.call("Input.dispatchMouseEvent", {
    button: "none",
    modifiers,
    type: "mouseMoved",
    x,
    y,
  });
  await client.call("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 1,
    clickCount: 1,
    modifiers,
    type: "mousePressed",
    x,
    y,
  });
  await delay(16);
  await client.call("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 0,
    clickCount: 1,
    modifiers,
    type: "mouseReleased",
    x,
    y,
  });
}

export async function dispatchWheel(client, { deltaX = 0, deltaY = 0, modifiers = 0, x, y }) {
  await client.call("Input.dispatchMouseEvent", {
    deltaX,
    deltaY,
    modifiers,
    type: "mouseWheel",
    x,
    y,
  });
}

export async function dispatchKeyEvent(
  client,
  { code, key, modifiers = 0, text = "", type = "keyDown" },
) {
  await client.call("Input.dispatchKeyEvent", {
    code,
    key,
    modifiers,
    text,
    type,
  });
}

export async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2) + "\n");
}

export async function startChromiumTrace(client, path) {
  const traceEvents = [];
  const removeDataListener = client.on("Tracing.dataCollected", (params) => {
    if (Array.isArray(params.value)) {
      traceEvents.push(...params.value);
    }
  });
  let removeCompleteListener = () => {};
  const complete = new Promise((resolvePromise) => {
    removeCompleteListener = client.on("Tracing.tracingComplete", resolvePromise);
  });
  await client.call("Tracing.start", {
    categories: [
      "blink",
      "cc",
      "devtools.timeline",
      "disabled-by-default-devtools.timeline",
      "disabled-by-default-v8.cpu_profiler",
      "latencyInfo",
      "loading",
      "toplevel",
      "v8",
    ].join(","),
    transferMode: "ReportEvents",
  });
  return {
    async stop() {
      await client.call("Tracing.end");
      await complete;
      removeDataListener();
      removeCompleteListener();
      const trace = { traceEvents };
      await writeJson(path, trace);
      return {
        eventCount: traceEvents.length,
        path,
        summary: summarizeChromiumTrace(traceEvents),
      };
    },
  };
}

export function summarizeChromiumTrace(traceEvents) {
  const completeEvents = traceEvents
    .filter((event) => event.ph === "X" && Number.isFinite(event.dur))
    .map((event) => ({
      category: String(event.cat ?? ""),
      durationMs: event.dur / 1000,
      name: String(event.name ?? ""),
      pid: event.pid,
      tid: event.tid,
      tsMs: Number.isFinite(event.ts) ? event.ts / 1000 : 0,
    }));
  const byName = new Map();
  for (const event of completeEvents) {
    const key = `${event.name} [${event.category}]`;
    const current = byName.get(key) ?? {
      category: event.category,
      count: 0,
      maxMs: 0,
      name: event.name,
      totalMs: 0,
    };
    current.count += 1;
    current.maxMs = Math.max(current.maxMs, event.durationMs);
    current.totalMs += event.durationMs;
    byName.set(key, current);
  }
  const roundEvent = (event) => ({
    ...event,
    durationMs: roundTraceMs(event.durationMs),
    tsMs: roundTraceMs(event.tsMs),
  });
  const roundGroup = (group) => ({
    ...group,
    maxMs: roundTraceMs(group.maxMs),
    totalMs: roundTraceMs(group.totalMs),
  });
  return {
    completeEventCount: completeEvents.length,
    longEvents: completeEvents
      .filter((event) => event.durationMs >= 8)
      .toSorted((left, right) => right.durationMs - left.durationMs)
      .slice(0, 60)
      .map(roundEvent),
    topByTotalDuration: [...byName.values()]
      .toSorted((left, right) => right.totalMs - left.totalMs)
      .slice(0, 40)
      .map(roundGroup),
  };
}

function roundTraceMs(value) {
  return Math.round(value * 1000) / 1000;
}

export async function readJsonLinesOptional(path) {
  try {
    const raw = await readFile(path, "utf8");
    return raw
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
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

function launchElectron({
  artifactDir,
  debugPort,
  electronArgs,
  extraEnv,
  fixture,
  unsetEnv,
  visible,
}) {
  const env = {
    ...process.env,
    ...extraEnv,
    ELECTRON_DISABLE_SECURITY_WARNINGS: "1",
    SETTA_APP_DATA_DIR: fixture.appDataDir,
    SETTA_BACKEND_READY_TIMEOUT_MS: "30000",
    SETTA_E2E: "1",
    SETTA_E2E_BLOCK_EXTERNAL_OPEN: "1",
    SETTA_E2E_OPEN_WORKSPACE_ROOT: fixture.workspaceRoot,
    SETTA_RECORD_INCLUDE_PAYLOADS: "1",
    SETTA_RECORD_SCREENSHOT_INTERVAL_MS: "0",
    SETTA_RECORDING: "1",
    SETTA_RECORDING_DIR: artifactDir,
    ...(visible ? { SETTA_E2E_VISIBLE: "1" } : {}),
  };
  for (const name of unsetEnv) {
    delete env[name];
  }
  const electron = spawn(
    electronBin(),
    [`--remote-debugging-port=${debugPort}`, ...electronArgs, "."],
    {
      cwd: desktopRoot,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  electron.logs = [];
  electron.stdout.on("data", (data) => appendLog(electron.logs, data));
  electron.stderr.on("data", (data) => appendLog(electron.logs, data));
  return electron;
}

function isPageNavigationTransient(error) {
  return (
    error instanceof Error &&
    error.message.includes('"code":-32000') &&
    error.message.includes("Inspected target navigated or closed")
  );
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

async function stopElectron(child) {
  if (child.exitCode !== null || child.killed) {
    return;
  }
  const exitPromise = new Promise((resolvePromise) => {
    child.once("exit", resolvePromise);
  });
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

function electronBin() {
  const extension = process.platform === "win32" ? ".cmd" : "";
  return join(desktopRoot, "node_modules", ".bin", `electron${extension}`);
}

function appendLog(logs, data) {
  logs.push(data.toString());
  if (logs.length > 300) {
    logs.shift();
  }
}

async function writeElectronOutput(context) {
  await writeFile(join(context.artifactDir, "electron-output.log"), context.electron.logs.join(""));
}
