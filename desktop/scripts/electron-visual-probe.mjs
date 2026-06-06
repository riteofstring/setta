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

import { CDPClient } from "./cdp-client.mjs";
import { stopElectron } from "./electron-process.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(scriptDir, "..");
const repoRoot = resolve(desktopRoot, "..");
const options = parseArgs(process.argv.slice(2));
const defaultArtifactDir = join(repoRoot, ".codex", "electron", "latest");
const artifactDir = options.outDir ? resolve(options.outDir) : defaultArtifactDir;
const pageLoadTimeoutMs = 20_000;
const probeTimeoutMs = 12_000;
const cleanupRetryCount = 5;

function parseArgs(args) {
  const parsed = {
    keepTemp: false,
    outDir: "",
    visible: process.env.SETTA_E2E_VISIBLE === "1",
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case "--keep-temp":
        parsed.keepTemp = true;
        break;
      case "--out-dir":
        index += 1;
        if (!args[index]) {
          throw new Error("--out-dir requires a path");
        }
        parsed.outDir = args[index];
        break;
      case "--visible":
        parsed.visible = true;
        break;
      default:
        throw new Error(`unknown electron visual probe argument: ${arg}`);
    }
  }
  return parsed;
}

async function main() {
  assertBuildExists();
  await removeTree(artifactDir);
  await mkdir(artifactDir, { recursive: true });

  const fixture = await createFixture();
  let context = null;
  let failure = null;

  try {
    context = await launchContext(fixture, artifactDir);
    await runNiriProbe(context.client);
  } catch (error) {
    failure = error;
    await captureFailureState(context?.client);
  } finally {
    await cleanupProbe(context, fixture);
  }

  await assertProbePassed(failure, context?.electron?.logs ?? []);
  await writeFile(
    join(artifactDir, "summary.json"),
    JSON.stringify(
      {
        artifacts: ["01-launch.png", "02-niri-phase1.png", "03-compact-window.png"],
        outDir: artifactDir,
        status: "passed",
      },
      null,
      2,
    ) + "\n",
  );
  process.stdout.write(`Electron visual probe passed. Artifacts: ${artifactDir}\n`);
}

async function runNiriProbe(client) {
  await captureProbeState(client, "01-launch");

  await waitForText(client, "500/40");
  await waitForNiriReady(client);
  await captureProbeState(client, "02-niri-phase1");

  await resizeElectronWindow(client, 320, 320);
  await waitForViewportSize(client, 320, 320);
  const compactState = await captureProbeState(client, "03-compact-window");
  assertCompactNiriState(compactState);
}

async function captureFailureState(client) {
  if (!client) {
    return;
  }
  await captureProbeState(client, "failure").catch(() => {});
}

async function cleanupProbe(context, fixture) {
  closeClient(context);
  await stopContextElectron(context);
  await writeContextLogs(context);
  await cleanupFixture(fixture);
}

function closeClient(context) {
  context?.client?.close();
}

async function stopContextElectron(context) {
  if (!context?.electron) {
    return;
  }
  await stopElectron(context.electron);
}

async function writeContextLogs(context) {
  await writeProbeLogs(context?.electron?.logs ?? [], context?.browserLogs ?? []);
}

async function cleanupFixture(fixture) {
  if (options.keepTemp) {
    await writeFile(join(artifactDir, "temp-root.txt"), fixture.tempRoot + "\n");
    return;
  }
  await removeTree(fixture.tempRoot);
}

async function assertProbePassed(failure, logs) {
  await assertNoIpcFailures(artifactDir);
  if (failure) {
    throw failureWithLogs(failure, logs);
  }
}

async function launchContext(fixture, recordingDir) {
  const debugPort = await openPort();
  const electron = launchElectron(debugPort, fixture, recordingDir);
  const target = await connectToSettaPage(debugPort);
  const client = await CDPClient.connect(target.webSocketDebuggerUrl, pageLoadTimeoutMs);
  const browserLogs = [];
  client.on("Runtime.consoleAPICalled", (params) => {
    browserLogs.push(formatConsoleEvent(params));
  });
  client.on("Runtime.exceptionThrown", (params) => {
    browserLogs.push(`[renderer:exception] ${params.exceptionDetails?.text ?? "exception"}`);
  });
  client.on("Log.entryAdded", (params) => {
    const entry = params.entry;
    browserLogs.push(`[renderer:${entry.level}] ${entry.text}`);
  });
  await client.call("Page.enable");
  await client.call("Runtime.enable");
  await client.call("Log.enable").catch(() => {});
  await installProbeHelpers(client);
  return { browserLogs, client, electron };
}

function launchElectron(debugPort, fixture, recordingDir) {
  const electron = spawn(electronBin(), [`--remote-debugging-port=${debugPort}`, "."], {
    cwd: desktopRoot,
    detached: process.platform !== "win32",
    env: {
      ...process.env,
      SETTA_APP_DATA_DIR: fixture.appDataDir,
      SETTA_E2E: "1",
      SETTA_E2E_BLOCK_EXTERNAL_OPEN: "1",
      SETTA_E2E_OPEN_WORKSPACE_ROOT: fixture.workspaceRoot,
      ...(options.visible ? { SETTA_E2E_VISIBLE: "1" } : {}),
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

async function installProbeHelpers(client) {
  await client.evaluate(`(() => {
    window.settaVisualProbeButton = (kind, expected) => {
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

async function captureProbeState(client, name) {
  await mkdir(artifactDir, { recursive: true });
  await requestRendererLayoutSnapshot(client, name);
  await captureScreenshot(client, join(artifactDir, `${name}.png`));
  const domState = await readDomState(client);
  await writeFile(join(artifactDir, `${name}.dom.json`), JSON.stringify(domState, null, 2) + "\n");
  const accessibility = await client.call("Accessibility.getFullAXTree").catch((error) => ({
    error: error.message,
    nodes: [],
  }));
  await writeFile(
    join(artifactDir, `${name}.accessibility.txt`),
    accessibilityTreeText(accessibility.nodes ?? []) + "\n",
  );
  return domState;
}

async function captureScreenshot(client, path) {
  const image = await client.call("Page.captureScreenshot", {
    captureBeyondViewport: true,
    format: "png",
    fromSurface: true,
  });
  await writeFile(path, Buffer.from(image.data, "base64"));
}

async function readDomState(client) {
  return client.evaluate(`(() => {
    const root = document.documentElement;
    const style = getComputedStyle(root);
    const latestReport = window.__settaNiriReadPhaseOneReports?.().at(-1) ?? null;
    const elementState = (selector) => {
      const element = document.querySelector(selector);
      if (!element) {
        return { present: false, visible: false };
      }
      const rect = element.getBoundingClientRect();
      const computed = getComputedStyle(element);
      return {
        height: Math.round(rect.height),
        left: Math.round(rect.left),
        present: true,
        top: Math.round(rect.top),
        visible: computed.display !== "none" && computed.visibility !== "hidden" && rect.width > 0 && rect.height > 0,
        width: Math.round(rect.width),
      };
    };
    return {
      bodyText: document.body.innerText.slice(0, 12000),
      colorMode: root.dataset.colorMode ?? "",
      viewport: {
        height: window.innerHeight,
        width: window.innerWidth,
      },
      shell: {
        benchmarkStatus: elementState('[data-testid="niri-benchmark-status"]'),
        projectSidebar: elementState(".setta-sidebar-surface"),
        topBar: elementState('[data-testid="shell-top-bar"]'),
      },
      panes: {
        bottom: elementState('[data-testid="bottom-workspace-pane"]'),
        chat: elementState('[data-testid="chat-detail-pane"]'),
        project: elementState(".setta-sidebar-surface"),
        right: elementState('[data-testid="right-workspace-pane"]'),
      },
      niri: {
        debugText: document.querySelector('[data-testid="niri-debug-overlay"]')?.textContent ?? "",
        hostCount: document.querySelectorAll('[data-testid="niri-fake-pane-host"]').length,
        latestReport,
        paneCount: document.querySelector('[data-testid="niri-workspace-area"]')?.getAttribute("data-pane-count") ?? "",
        workspace: elementState('[data-testid="niri-workspace-area"]'),
      },
      cssVariables: {
        background: style.getPropertyValue("--background").trim(),
        border: style.getPropertyValue("--border").trim(),
        foreground: style.getPropertyValue("--foreground").trim(),
        primary: style.getPropertyValue("--primary").trim(),
        settaLogo: style.getPropertyValue("--setta-logo").trim(),
        sidebar: style.getPropertyValue("--sidebar").trim(),
      },
      title: document.title,
      url: location.href,
    };
  })()`);
}

function assertCompactNiriState(state) {
  if (state.viewport.width > 320 || state.viewport.height > 320) {
    throw new Error(`compact window did not resize to 320px: ${JSON.stringify(state.viewport)}`);
  }
  if (!state.niri.workspace.visible || state.niri.hostCount !== 40) {
    throw new Error(`compact window lost niri workspace hosts: ${JSON.stringify(state.niri)}`);
  }
  if (!state.shell.topBar.present || !state.shell.projectSidebar.visible) {
    throw new Error(`compact window lost shell/sidebar: ${JSON.stringify(state.shell)}`);
  }
}

async function waitForNiriReady(client) {
  return waitForState(
    client,
    `(() => {
      const report = window.__settaNiriReadPhaseOneReports?.().at(-1) ?? null;
      const debugText = document.querySelector('[data-testid="niri-debug-overlay"]')?.textContent ?? "";
      return {
        debugText,
        hostCount: document.querySelectorAll('[data-testid="niri-fake-pane-host"]').length,
        paneCount: document.querySelector('[data-testid="niri-workspace-area"]')?.getAttribute("data-pane-count") ?? "",
        report,
        workspaceReady: Boolean(document.querySelector('[data-testid="niri-workspace-area"]')),
      };
    })()`,
    niriReadyState,
    probeTimeoutMs,
  );
}

function niriReadyState(value) {
  return niriShellReady(value) && niriMetricsReady(value) && niriReportReady(value);
}

function niriMetricsReady(value) {
  return value.debugText.includes("visible 40") && value.debugText.includes("react 0");
}

function niriReportReady(value) {
  return (
    value.report?.result === "pass" && value.report?.environment?.rendererMode === "production"
  );
}

function niriShellReady(value) {
  return value.workspaceReady && value.paneCount === "500" && value.hostCount === 40;
}

async function waitForText(client, text) {
  return waitForState(
    client,
    `(() => ({ body: document.body.innerText }))()`,
    (value) => value.body.includes(text),
    probeTimeoutMs,
  );
}

async function resizeElectronWindow(client, width, height) {
  await client.evaluate(`window.resizeTo(${JSON.stringify(width)}, ${JSON.stringify(height)})`);
}

async function waitForViewportSize(client, maxWidth, maxHeight) {
  return waitForState(
    client,
    `(() => ({ height: window.innerHeight, width: window.innerWidth }))()`,
    (value) => value.width <= maxWidth && value.height <= maxHeight,
    probeTimeoutMs,
  );
}

async function waitForState(client, expression, isReady, timeoutMs) {
  const startedAt = Date.now();
  let lastValue = null;
  while (Date.now() - startedAt < timeoutMs) {
    lastValue = await client.evaluate(expression);
    if (isReady(lastValue)) {
      return lastValue;
    }
    await delay(100);
  }
  throw new Error(`timed out waiting for Electron visual state: ${JSON.stringify(lastValue)}`);
}

async function requestRendererLayoutSnapshot(client, trigger) {
  await client.evaluate(`(() => {
    window.dispatchEvent(new CustomEvent("setta:record-layout-snapshot", {
      detail: { trigger: ${JSON.stringify(trigger)} },
    }));
  })()`);
  await delay(25);
}

function accessibilityTreeText(nodes) {
  const lines = [];
  for (const node of nodes) {
    const role = node.role?.value;
    const name = node.name?.value;
    if (!role || (!name && role !== "RootWebArea")) {
      continue;
    }
    lines.push(`${role}${name ? `: ${name}` : ""}`);
  }
  return lines.slice(0, 2000).join("\n");
}

function formatConsoleEvent(params) {
  const args = (params.args ?? []).map(formatRemoteObject).join(" ");
  return `[renderer:${params.type}] ${args}`;
}

function formatRemoteObject(value) {
  if ("value" in value) {
    return String(value.value);
  }
  return value.description ?? value.unserializableValue ?? value.type ?? "";
}

async function writeProbeLogs(electronLogs, browserLogs) {
  await writeFile(join(artifactDir, "electron.log"), electronLogs.join(""));
  await writeFile(join(artifactDir, "console.log"), browserLogs.join("\n") + "\n");
}

async function assertNoIpcFailures(recordingDir) {
  const path = join(recordingDir, "ipc.jsonl");
  if (!existsSync(path)) {
    return;
  }
  const entries = await readJsonLines(path);
  const failures = entries.filter((entry) => entry.type === "ipc_failure");
  if (failures.length > 0) {
    throw new Error(`visual probe recorded IPC failures: ${JSON.stringify(failures)}`);
  }
}

async function readJsonLines(path) {
  const content = await readFile(path, "utf8");
  return content
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line));
}

async function createFixture() {
  const tempRoot = await mkdtemp(join(tmpdir(), "setta-electron-visual-probe-"));
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
        return page;
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
  if (logs.length > 200) {
    logs.shift();
  }
}

async function removeTree(path) {
  let lastError = null;
  for (let attempt = 0; attempt < cleanupRetryCount; attempt += 1) {
    try {
      await rm(path, { force: true, maxRetries: 2, recursive: true, retryDelay: 100 });
      return;
    } catch (error) {
      lastError = error;
      await delay(100 * (attempt + 1));
    }
  }
  throw lastError;
}

function failureWithLogs(error, logs) {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(`${message}\nElectron output:\n${logs.join("")}`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
