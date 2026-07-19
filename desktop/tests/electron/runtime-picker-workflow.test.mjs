#!/usr/bin/env node
/* global AbortSignal, console, fetch, URL */

import { spawn } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

import { driverCallExpression } from "./cdp-client.mjs";
import {
  assertBuildExists,
  captureScreenshot,
  clickButtonByAria,
  configureElectronWorkflowHarness,
  createFixture,
  failureWithLogs,
  launchContext,
  openFixtureWorkspace,
  pathTimestamp,
  setInputValue,
  stopLaunchedContext,
  waitForState,
} from "./electron-workflow-harness.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(scriptDir, "../..");
const repoRoot = resolve(desktopRoot, "..");
const workflowTimeoutMs = 45_000;
const options = parseArgs(process.argv.slice(2));
configureElectronWorkflowHarness({ visible: options.visible });
const recordingRoot = options.keepArtifacts
  ? join(repoRoot, "test-results", "electron-integration", "runtime-picker", pathTimestamp())
  : join(repoRoot, "test-results", "electron-integration", "runtime-picker");

if (options.help) {
  console.log(
    "Usage: node desktop/tests/electron/runtime-picker-workflow.test.mjs [--visible] [--keep-artifacts]",
  );
  process.exit(0);
}

assertBuildExists();
if (!options.keepArtifacts) {
  await rm(recordingRoot, { force: true, recursive: true });
}
await mkdir(recordingRoot, { recursive: true });

const fixture = await createFixture("runtime-picker");
const remoteRoot = await mkdtemp(join(tmpdir(), "setta-runtime-picker-remote-"));
const remoteAppDataDir = join(remoteRoot, "app-data");
const recordingDir = join(recordingRoot, "workflow");
let context = null;
let remoteServe = null;

try {
  remoteServe = await startRemoteRuntime(remoteAppDataDir);
  context = await launchContext(fixture, recordingDir);

  await waitForRuntimeStatus(context.client, "connected");
  const initial = await runtimeSnapshot(context.client);
  const local = initial.runtimes.find((runtime) => runtime.isLocal);
  if (!local) {
    throw new Error(`local runtime missing: ${JSON.stringify(initial)}`);
  }

  await openWorkspaceFromApp(context.client);
  const localWorkspace = await waitForSelectedWorkspaceLayout(context.client);
  const localPanes = await createConversationPaneFromToolbar(
    context.client,
    localWorkspace.selectedWorkspaceId,
  );

  await addRuntimeThroughPicker(context.client, remoteServe.pairingURL);
  const remoteConnected = await waitForRuntimeStatus(context.client, "connected", {
    isLocal: false,
  });
  const remote = remoteConnected.runtimes.find((runtime) => runtime.active && !runtime.isLocal);
  if (!remote) {
    throw new Error(`remote runtime did not become active: ${JSON.stringify(remoteConnected)}`);
  }
  const probe = await pairProbeDevice(remoteAppDataDir);
  const remoteEmptySession = await probe.get("/workspace-session");
  assertRemoteSessionEmpty(remoteEmptySession);
  await waitForRendererEmptyWorkspace(context.client);

  await openFixtureWorkspace(context.client, workflowTimeoutMs);
  const canonicalWorkspaceRoot = await realpath(fixture.workspaceRoot);
  const remoteSession = await waitForRemoteWorkspace(probe, canonicalWorkspaceRoot);
  await waitForSelectedWorkspaceLayout(context.client, remoteSession.selectedWorkspaceId);
  const remotePanes = await createConversationPaneFromToolbar(
    context.client,
    remoteSession.selectedWorkspaceId,
  );
  await appendSummary("remote-workspace-opened", {
    paneCount: remotePanes.paneIds.length,
    remoteRuntimeId: remote.runtimeId,
    selectedWorkspaceId: remoteSession.selectedWorkspaceId,
  });

  const desktopDeviceId = await desktopDeviceIdForRemote(probe);
  await runSettaCommand(["devices", "revoke", "--app-data-dir", remoteAppDataDir, desktopDeviceId]);
  await triggerRendererBackendRead(context.client);
  await waitForRuntimeStatus(context.client, "revoked", { runtimeId: remote.runtimeId });

  await clickRuntimePickerButton(context.client, `Switch to ${local.displayName}`);
  await waitForRuntimeStatus(context.client, "connected", { runtimeId: local.runtimeId });
  await waitForSelectedWorkspaceLayout(context.client, localWorkspace.selectedWorkspaceId);
  const returnedLocalPanes = await waitForSurvivorWorkspacePanes(
    context.client,
    localWorkspace.selectedWorkspaceId,
  );
  assertLocalWorkspacePanesSurvivedRuntimeSwitch(localPanes, returnedLocalPanes);

  await stopProcess(remoteServe.child);
  await waitForRemoteRuntimeStopped(remote.baseUrl);
  remoteServe = null;
  await clickRuntimePickerButton(context.client, `Switch to ${remote.displayName}`);
  await waitForRuntimeStatus(context.client, "unreachable", { runtimeId: remote.runtimeId });

  await captureScreenshot(context.client, join(recordingDir, "runtime-picker-final.png"));
  await appendSummary("passed", {
    localPaneCount: localPanes.paneIds.length,
    localRuntimeId: local.runtimeId,
    remotePaneCount: remotePanes.paneIds.length,
    remoteRuntimeId: remote.runtimeId,
  });
  console.log(`Electron runtime picker workflow passed: ${recordingDir}`);
} catch (error) {
  if (context) {
    await captureScreenshot(context.client, join(recordingDir, "failure.png")).catch(() => {});
    await writeFile(
      join(recordingDir, "runtime-picker-failure.json"),
      JSON.stringify(
        {
          error: error instanceof Error ? error.message : String(error),
          snapshot: await safeRuntimeSnapshot(context.client),
        },
        null,
        2,
      ) + "\n",
    ).catch(() => {});
  }
  throw context ? failureWithLogs(error, context.electron.logs) : error;
} finally {
  await stopLaunchedContext(context);
  if (remoteServe) {
    await stopProcess(remoteServe.child);
  }
  await rm(remoteRoot, { force: true, recursive: true }).catch(() => {});
}

function parseArgs(args) {
  const parsed = {
    help: false,
    keepArtifacts: false,
    visible: process.env.SETTA_E2E_VISIBLE === "1",
  };
  for (const arg of args) {
    switch (arg) {
      case "--help":
      case "-h":
        parsed.help = true;
        break;
      case "--keep-artifacts":
        parsed.keepArtifacts = true;
        break;
      case "--skip-build":
        break;
      case "--visible":
        parsed.visible = true;
        break;
      default:
        throw new Error(`unknown runtime picker workflow argument: ${arg}`);
    }
  }
  return parsed;
}

async function addRuntimeThroughPicker(client, pairingURL) {
  await ensureRuntimePickerVisible(client);
  await clickButtonByAria(client, "Add runtime");
  await waitForState(
    client,
    `(() => ({ ready: Boolean(document.querySelector('input[aria-label="Runtime pairing URL"]')) }))()`,
    (value) => value.ready,
    workflowTimeoutMs,
  );
  await setInputValue(client, 'input[aria-label="Runtime pairing URL"]', pairingURL);
  const submitted = await client.evaluate(`(() => {
    const button = document.querySelector('[data-testid="runtime-picker"] form button[type="submit"]');
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return false;
    }
    button.click();
    return true;
  })()`);
  if (!submitted) {
    throw new Error("runtime pairing form submit button was not clickable");
  }
}

async function clickRuntimePickerButton(client, label) {
  await ensureRuntimePickerVisible(client);
  await clickButtonByAria(client, label);
}

async function ensureRuntimePickerVisible(client) {
  const visible = await client.evaluate(runtimePickerVisibleExpression());
  if (visible) {
    return;
  }
  await clickButtonByAria(client, "Open settings");
  await waitForState(
    client,
    `(() => ({ visible: ${runtimePickerVisibleExpression()} }))()`,
    (state) => state.visible,
    workflowTimeoutMs,
  );
}

function runtimePickerVisibleExpression() {
  return `Boolean(document.querySelector('[data-testid="settings-shell-page"] [data-testid="runtime-picker"]'))`;
}

async function waitForRuntimeStatus(client, status, filter = {}) {
  return waitForState(
    client,
    `(async () => window.setta.runtimes.current())()`,
    (snapshot) => {
      if (snapshot.switching || snapshot.connection.status !== status) {
        return false;
      }
      if (filter.runtimeId && snapshot.connection.runtimeId !== filter.runtimeId) {
        return false;
      }
      if (filter.isLocal !== undefined) {
        const active = snapshot.runtimes.find((runtime) => runtime.active);
        return active?.isLocal === filter.isLocal;
      }
      return true;
    },
    workflowTimeoutMs,
  );
}

async function runtimeSnapshot(client) {
  return client.evaluate(`(async () => window.setta.runtimes.current())()`);
}

async function safeRuntimeSnapshot(client) {
  try {
    return await runtimeSnapshot(client);
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

async function triggerRendererBackendRead(client) {
  await client.evaluate(`(async () => {
    try {
      await window.setta.workspace.session();
    } catch {
      return false;
    }
    return true;
  })()`);
}

async function openWorkspaceFromApp(client) {
  await openFixtureWorkspace(client, workflowTimeoutMs);
  await waitForSelectedWorkspaceLayout(client);
}

async function createConversationPaneFromToolbar(client, workspaceId) {
  await closeSettingsIfOpen(client);
  const result = await client.driver("topicConversationClickNewFrameConversation");
  if (!result.clicked) {
    throw new Error(`new frame conversation action failed: ${JSON.stringify(result)}`);
  }
  return waitForSurvivorWorkspacePanes(client, workspaceId);
}

async function closeSettingsIfOpen(client) {
  const open = await client.evaluate(
    `Boolean(document.querySelector('[data-testid="settings-shell-page"]'))`,
  );
  if (!open) {
    return;
  }
  await client.call("Input.dispatchKeyEvent", {
    code: "Escape",
    key: "Escape",
    type: "keyDown",
  });
  await client.call("Input.dispatchKeyEvent", {
    code: "Escape",
    key: "Escape",
    type: "keyUp",
  });
  await waitForState(
    client,
    `(() => ({ open: Boolean(document.querySelector('[data-testid="settings-shell-page"]')) }))()`,
    (state) => !state.open,
    workflowTimeoutMs,
  );
}

async function waitForSelectedWorkspaceLayout(client, expectedWorkspaceId = "") {
  return waitForState(
    client,
    `(async () => {
      const session = await window.setta.workspace.session();
      const area = document.querySelector('[data-testid="workspace-layout-area"]');
      const layoutWorkspaceId = area instanceof HTMLElement ? area.dataset.workspaceId ?? "" : "";
      return {
        activeWorkspaces: session.activeWorkspaces,
        layoutWorkspaceId,
        selectedWorkspaceId: session.selectedWorkspaceId,
      };
    })()`,
    (state) => {
      const selectedWorkspaceId = expectedWorkspaceId || state.selectedWorkspaceId;
      return (
        selectedWorkspaceId !== "" &&
        state.selectedWorkspaceId === selectedWorkspaceId &&
        state.layoutWorkspaceId === selectedWorkspaceId
      );
    },
    workflowTimeoutMs,
  );
}

async function waitForRendererEmptyWorkspace(client) {
  return waitForState(
    client,
    `(() => {
      const area = document.querySelector('[data-testid="workspace-layout-area"]');
      const masterPane = document.querySelector(
        '[data-testid="workspace-pane-host"][data-surface-kind="master"][data-visible="true"]',
      );
      return {
        masterVisible: Boolean(masterPane),
        paneCount: area instanceof HTMLElement ? area.dataset.paneCount ?? "" : "",
        workspaceId: area instanceof HTMLElement ? area.dataset.workspaceId ?? null : null,
      };
    })()`,
    (state) => state.masterVisible && state.workspaceId === "empty" && state.paneCount === "1",
    workflowTimeoutMs,
  );
}

async function waitForSurvivorWorkspacePanes(client, expectedWorkspaceId) {
  return waitForState(
    client,
    driverCallExpression("runtimePickerWorkspacePaneSnapshot"),
    (snapshot) =>
      snapshot.workspaceId === expectedWorkspaceId &&
      snapshot.paneCount > 0 &&
      snapshot.paneIds.length === snapshot.paneCount &&
      snapshot.paneIds.every((paneId) => paneId !== "") &&
      snapshot.surfaceKinds.every((surfaceKind) =>
        ["conversation", "empty-frame"].includes(surfaceKind),
      ),
    workflowTimeoutMs,
  );
}

function assertRemoteSessionEmpty(session) {
  if (session.selectedWorkspaceId !== "" || session.activeWorkspaces.length !== 0) {
    throw new Error(`remote runtime should start with no workspaces: ${JSON.stringify(session)}`);
  }
}

function assertLocalWorkspacePanesSurvivedRuntimeSwitch(before, after) {
  const beforeEmptyFrames = paneIdsForKind(before, "empty-frame");
  const afterEmptyFrames = paneIdsForKind(after, "empty-frame");
  const beforeIds = new Set(before.paneIds);
  const afterIds = new Set(after.paneIds);
  const added = after.panes.filter((pane) => !beforeIds.has(pane.paneId));
  const valid =
    before.paneIds.every((paneId) => afterIds.has(paneId)) &&
    JSON.stringify(afterEmptyFrames) === JSON.stringify(beforeEmptyFrames) &&
    added.every((pane) => pane.surfaceKind === "conversation");
  if (!valid) {
    throw new Error(
      `local workspace panes changed after runtime switch: ${JSON.stringify({ added, after: after.panes, before: before.panes })}`,
    );
  }
}

function paneIdsForKind(snapshot, surfaceKind) {
  return snapshot.panes
    .filter((pane) => pane.surfaceKind === surfaceKind)
    .map((pane) => pane.paneId);
}

async function waitForRemoteWorkspace(probe, workspaceRoot) {
  return waitForStateValue(
    async () => probe.get("/workspace-session"),
    (session) =>
      session.activeWorkspaces.some((workspace) => workspace.rootPath === workspaceRoot) &&
      session.selectedWorkspaceId !== "",
    workflowTimeoutMs,
  );
}

async function desktopDeviceIdForRemote(probe) {
  const devices = await probe.post("/devices/list", {});
  const desktop = devices.devices.find((device) => device.displayName.startsWith("Setta Desktop"));
  if (!desktop) {
    throw new Error(`desktop device was not listed: ${JSON.stringify(devices)}`);
  }
  return desktop.deviceId;
}

async function pairProbeDevice(appDataDir) {
  const pairingURL = await mintPairingURL(appDataDir);
  const parsed = parsePairingURL(pairingURL);
  const response = await fetch(parsed.baseUrl + "pairing/complete", {
    body: JSON.stringify({
      clientDisplayName: "Runtime Picker Probe",
      pairingToken: parsed.pairingToken,
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`probe pairing failed with ${response.status}: ${body}`);
  }
  const paired = JSON.parse(body);
  return {
    baseUrl: parsed.baseUrl,
    deviceToken: paired.deviceToken,
    get: (path) => remoteRequest(parsed.baseUrl, paired.deviceToken, "GET", path),
    post: (path, payload) =>
      remoteRequest(parsed.baseUrl, paired.deviceToken, "POST", path, payload),
  };
}

async function remoteRequest(baseUrl, deviceToken, method, path, payload) {
  const headers = { Authorization: "Bearer " + deviceToken };
  const init = { headers, method };
  if (payload !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(payload);
  }
  const response = await fetch(baseUrl + path.replace(/^\//, ""), init);
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`remote ${method} request ${path} failed with ${response.status}: ${body}`);
  }
  return JSON.parse(body);
}

async function startRemoteRuntime(appDataDir) {
  await mkdir(appDataDir, { recursive: true });
  const child = spawn(
    join(repoRoot, "scripts/go.sh"),
    ["run", "./cmd/setta", "serve", "--app-data-dir", appDataDir, "--port", "0"],
    {
      cwd: repoRoot,
      detached: true,
      env: {
        ...process.env,
        SETTA_E2E: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  child.logs = [];
  child.stdout.on("data", (data) => appendProcessLog(child, data));
  child.stderr.on("data", (data) => appendProcessLog(child, data));
  const pairingURL = await waitForPairingURL(child);
  return { child, pairingURL };
}

async function mintPairingURL(appDataDir) {
  const result = await runSettaCommand(["pair", "--app-data-dir", appDataDir]);
  const match = result.stdout.match(/setta:\/\/pair\?[^\s]+/);
  if (!match) {
    throw new Error(`pairing URL was not printed:\n${result.stdout}\n${result.stderr}`);
  }
  return match[0];
}

async function runSettaCommand(args) {
  const child = spawn(join(repoRoot, "scripts/go.sh"), ["run", "./cmd/setta", ...args], {
    cwd: repoRoot,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (data) => {
    stdout += data.toString();
  });
  child.stderr.on("data", (data) => {
    stderr += data.toString();
  });
  const code = await new Promise((resolvePromise) => {
    child.once("exit", resolvePromise);
  });
  if (code !== 0) {
    throw new Error(`setta ${args.join(" ")} failed with ${code}\n${stdout}\n${stderr}`);
  }
  return { stderr, stdout };
}

async function waitForPairingURL(child) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < workflowTimeoutMs) {
    const output = child.logs.join("");
    const match = output.match(/setta:\/\/pair\?[^\s]+/);
    if (match) {
      return match[0];
    }
    if (child.exitCode !== null) {
      throw new Error(`remote setta serve exited before pairing URL:\n${output}`);
    }
    await delay(100);
  }
  throw new Error(`timed out waiting for remote pairing URL:\n${child.logs.join("")}`);
}

async function waitForStateValue(readState, isReady, timeoutMs) {
  const startedAt = Date.now();
  let lastValue = null;
  while (Date.now() - startedAt < timeoutMs) {
    lastValue = await readState();
    if (isReady(lastValue)) {
      return lastValue;
    }
    await delay(100);
  }
  throw new Error(`timed out waiting for state: ${JSON.stringify(lastValue)}`);
}

async function waitForRemoteRuntimeStopped(baseUrl) {
  const runtimeInfoURL = new URL("runtime/info", baseUrl).toString();
  const startedAt = Date.now();
  let lastProbe = null;
  while (Date.now() - startedAt < workflowTimeoutMs) {
    lastProbe = await probeRuntimeInfo(runtimeInfoURL);
    if (!lastProbe.reachable) {
      return;
    }
    await delay(100);
  }
  throw new Error(
    `remote runtime still answered ${runtimeInfoURL} after stop: ${JSON.stringify(lastProbe)}`,
  );
}

async function probeRuntimeInfo(runtimeInfoURL) {
  try {
    const response = await fetch(runtimeInfoURL, {
      method: "GET",
      signal: AbortSignal.timeout(1_000),
    });
    const body = await response.text();
    return {
      body: body.slice(0, 500),
      reachable: true,
      status: response.status,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      reachable: false,
    };
  }
}

function parsePairingURL(pairingURL) {
  const parsed = new URL(pairingURL);
  return {
    baseUrl: new URL(parsed.searchParams.get("url")).toString(),
    pairingToken: parsed.searchParams.get("tok"),
    runtimeId: parsed.searchParams.get("rt"),
  };
}

async function stopProcess(child) {
  if (!child) {
    return;
  }
  const exited = new Promise((resolvePromise) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolvePromise();
      return;
    }
    child.once("close", resolvePromise);
  });
  signalProcessGroup(child, "SIGTERM");
  const stopped = await Promise.race([exited.then(() => true), delay(8_000).then(() => false)]);
  if (!stopped && child.exitCode === null && child.signalCode === null) {
    signalProcessGroup(child, "SIGKILL");
    await Promise.race([exited, delay(3_000)]);
  }
}

function signalProcessGroup(child, signal) {
  if (child.pid === undefined) {
    return false;
  }
  if (process.platform === "win32") {
    child.kill(signal);
    return true;
  }
  try {
    process.kill(-child.pid, signal);
    return true;
  } catch (error) {
    if (isMissingProcessError(error)) {
      return false;
    }
    throw error;
  }
}

function isMissingProcessError(error) {
  return error instanceof Error && "code" in error && error.code === "ESRCH";
}

function appendProcessLog(child, data) {
  child.logs.push(data.toString());
  if (child.logs.length > 200) {
    child.logs.shift();
  }
}

async function appendSummary(step, payload) {
  await writeFile(
    join(recordingDir, `${step}.json`),
    JSON.stringify({ payload, step }, null, 2) + "\n",
  );
}
