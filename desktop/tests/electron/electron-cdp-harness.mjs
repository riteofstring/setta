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

export function parseElectronHarnessArgs(argv) {
  const options = {
    artifactDir: "",
    keepArtifacts: false,
    skipBuild: false,
    visible: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case "--artifact-dir": {
        const value = argv[index + 1];
        if (!value) {
          throw new Error("--artifact-dir requires a value");
        }
        options.artifactDir = resolve(value);
        index += 1;
        break;
      }
      case "--keep-artifacts":
        options.keepArtifacts = true;
        break;
      case "--skip-build":
        options.skipBuild = true;
        break;
      case "--visible":
        options.visible = true;
        break;
      case "-h":
      case "--help":
        options.help = true;
        break;
      default:
        throw new Error(`Unknown Electron harness argument: ${arg}`);
    }
  }
  return options;
}

export function timestampedRecordingDir(name) {
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+Z$/, "Z");
  return join(repoRoot, ".recordings", name, timestamp);
}

export async function writeLatestRecordingPointer(name, artifactDir) {
  const recordingRoot = join(repoRoot, ".recordings", name);
  const latestPath = join(recordingRoot, "latest");
  await mkdir(recordingRoot, { recursive: true });
  await rm(latestPath, { force: true, recursive: true });
  await symlink(artifactDir, latestPath, "dir");
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
  extraEnv = {},
  fixture,
  visible = false,
}) {
  await rm(artifactDir, { force: true, recursive: true });
  await mkdir(artifactDir, { recursive: true });
  const debugPort = await openPort();
  await writeFile(join(artifactDir, "debug-port.txt"), `${debugPort}\n`);
  const electron = launchElectron({
    artifactDir,
    debugPort,
    extraEnv,
    fixture,
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

export async function captureScreenshot(client, path) {
  await mkdir(dirname(path), { recursive: true });
  const image = await client.call("Page.captureScreenshot", { format: "png" });
  await writeFile(path, Buffer.from(image.data, "base64"));
}

export async function captureScreenshotClip(client, path, clip) {
  await mkdir(dirname(path), { recursive: true });
  const image = await client.call("Page.captureScreenshot", {
    captureBeyondViewport: false,
    clip: {
      height: clip.height,
      scale: clip.scale ?? 1,
      width: clip.width,
      x: clip.x,
      y: clip.y,
    },
    format: "png",
  });
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

function launchElectron({ artifactDir, debugPort, extraEnv, fixture, visible }) {
  const electron = spawn(electronBin(), [`--remote-debugging-port=${debugPort}`, "."], {
    cwd: desktopRoot,
    env: {
      ...process.env,
      ...extraEnv,
      ELECTRON_DISABLE_SECURITY_WARNINGS: "1",
      SETTA_APP_DATA_DIR: fixture.appDataDir,
      SETTA_E2E: "1",
      SETTA_E2E_BLOCK_EXTERNAL_OPEN: "1",
      SETTA_E2E_OPEN_WORKSPACE_ROOT: fixture.workspaceRoot,
      SETTA_RECORD_INCLUDE_PAYLOADS: "1",
      SETTA_RECORD_SCREENSHOT_INTERVAL_MS: "0",
      SETTA_RECORDING: "1",
      SETTA_RECORDING_DIR: artifactDir,
      ...(visible ? { SETTA_E2E_VISIBLE: "1" } : {}),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
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
