#!/usr/bin/env node
/* global console */

import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";

import { driverCallExpression } from "./cdp-client.mjs";
import { backendProbe } from "./chat-workflow-harness.mjs";
import { prepareLiveCodexAuth } from "./chat-live-auth.mjs";
import {
  assertBuildExists,
  captureScreenshot,
  clickEnabledButtonByAria,
  createElectronFixture,
  launchElectronCdpContext,
  parseElectronHarnessArgs,
  stopElectronCdpContext,
  timestampedRecordingDir,
  waitForSelector,
  waitForState,
  writeJson,
  writeLatestRecordingPointer,
} from "./electron-cdp-harness.mjs";

const options = parseElectronHarnessArgs(process.argv.slice(2));
const workflowName = "easy-button-live";
const workflowTimeoutMs = 180_000;
const liveRequestText = [
  "Read README.md in this workspace.",
  "Emit exactly one table artifact titled Live README Summary using setta.emit_artifact.",
  "Use columns Topic and Detail with three concise rows: Purpose, Interfaces, Verification.",
  "Then finish without creating or editing files.",
].join(" ");
const expectedArtifactTitle = "Live README Summary";

if (options.help) {
  console.log(
    "Usage: node desktop/tests/electron/easy-button-live-workflow.test.mjs [--skip-build] [--visible] [--keep-artifacts] [--artifact-dir <dir>]",
  );
  process.exit(0);
}

const artifactDir = options.artifactDir || timestampedRecordingDir(workflowName);
await writeLatestRecordingPointer(workflowName, artifactDir);
const liveAuth = await prepareLiveCodexAuth();
if (!liveAuth.available) {
  await writeJson(join(artifactDir, "summary.json"), {
    artifactDir,
    reason: liveAuth.reason,
    status: "skipped",
  });
  console.log(`Electron easy button live workflow skipped: ${liveAuth.reason}`);
  process.exit(0);
}

if (!options.skipBuild) {
  assertBuildExists();
}

const fixture = await createElectronFixture(workflowName);
await writeLiveReadme(fixture.workspaceRoot);
let context = null;

try {
  context = await launchElectronCdpContext({
    artifactDir,
    extraEnv: liveAuth.env,
    fixture,
    unsetEnv: liveAuth.unsetEnv,
    visible: options.visible,
  });
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
  await context.client.installDriver();
  const backend = await backendProbe(artifactDir);
  const workspaceId = await ensureWorkspaceOpen(context.client);

  await openEasyButtonFromShortcut(context.client);
  await waitForEasyButtonPane(context.client);
  await captureScreenshot(context.client, join(artifactDir, "easy-button-live-idle.png"));

  await submitEasyButtonRequest(context.client, liveRequestText);
  const working = await waitForEasyButtonWorking(context.client, liveRequestText);
  await captureScreenshot(context.client, join(artifactDir, "easy-button-live-working.png"));

  const terminal = await waitForEasyButtonLiveTerminal(context.client);
  assertLiveEasyButtonTerminal(terminal);
  await captureScreenshot(context.client, join(artifactDir, "easy-button-live-complete.png"));

  const snapshot = await backend.get(
    `/easy-runs/snapshot?workspaceId=${encodeURIComponent(workspaceId)}`,
  );
  assertLiveEasyRunSnapshot(snapshot);
  await assertEasyButtonLiveRecordingEvidence(artifactDir);

  await writeJson(join(artifactDir, "summary.json"), {
    artifactDir,
    snapshot,
    status: "passed",
    terminal,
    working,
  });
  console.log(`Electron easy button live workflow passed: ${artifactDir}`);
} catch (error) {
  if (context) {
    await captureScreenshot(context.client, join(artifactDir, "failure.png")).catch(() => {});
    await writeJson(join(artifactDir, "failure-snapshot.json"), {
      easyButton: await safeEasyButtonState(context.client),
    }).catch(() => {});
  }
  await writeJson(join(artifactDir, "summary.json"), {
    artifactDir,
    error: error instanceof Error ? error.message : String(error),
    status: "failed",
  });
  throw error;
} finally {
  await stopElectronCdpContext(context);
  await rm(fixture.tempRoot, { force: true, recursive: true });
}

async function writeLiveReadme(workspaceRoot) {
  await writeFile(
    join(workspaceRoot, "README.md"),
    `# Setta Live Easy Button Fixture

Setta is a local workspace application that coordinates hidden agent runs.

## Interfaces

- The Easy Button pane accepts a short request and shows typed presentation state.
- Artifacts are emitted through a backend-owned dynamic tool.
- Narrator highlights are sparse, typed, and capped.

## Verification

Live acceptance must prove the production Electron, preload, renderer, HTTP,
Codex harness, dynamic-tool, narrator, and persistence paths work together.
`,
  );
}

async function ensureWorkspaceOpen(client) {
  const currentWorkspaceId = await client.evaluate(workspaceIdExpression());
  if (currentWorkspaceId && currentWorkspaceId !== "empty") {
    return currentWorkspaceId;
  }
  await clickEnabledButtonByAria(client, "Open project folder", workflowTimeoutMs);
  return waitForState(
    client,
    workspaceIdExpression(),
    (workspaceId) => workspaceId !== "" && workspaceId !== "empty",
    workflowTimeoutMs,
  );
}

async function openEasyButtonFromShortcut(client) {
  const dispatched = await client.driver("easyButtonPaneOpenShortcut");
  if (!dispatched) {
    throw new Error("easy button shortcut was not dispatched");
  }
}

async function submitEasyButtonRequest(client, requestText) {
  const submitted = await client.driver("easyButtonPaneSubmitRequest", requestText);
  if (!submitted) {
    throw new Error(`easy button request input was not submittable: ${requestText}`);
  }
}

async function waitForEasyButtonPane(client) {
  return waitForState(
    client,
    easyButtonStateExpression(),
    (state) =>
      state.exists &&
      state.surfaceKind === "easy-button" &&
      state.easyState === "idle" &&
      state.paneChromeTitle === "Easy Button",
    workflowTimeoutMs,
  );
}

async function waitForEasyButtonWorking(client, requestText) {
  return waitForState(
    client,
    easyButtonStateExpression(),
    (state) =>
      state.exists &&
      state.surfaceKind === "easy-button" &&
      state.easyState === "working" &&
      state.requestText === requestText &&
      state.stopButtonVisible === true,
    workflowTimeoutMs,
  );
}

async function waitForEasyButtonLiveTerminal(client) {
  return waitForState(
    client,
    easyButtonStateExpression(),
    (state) =>
      state.exists &&
      state.surfaceKind === "easy-button" &&
      state.easyState === "complete" &&
      state.requestText === liveRequestText &&
      state.summaryText.includes("Done in") &&
      state.artifacts.some((artifact) => artifact.title === expectedArtifactTitle),
    workflowTimeoutMs,
  );
}

function assertLiveEasyButtonTerminal(state) {
  if (state.narratorStatusText !== "") {
    throw new Error(`easy-button live narrator degraded: ${JSON.stringify(state)}`);
  }
  if (!state.summaryText.includes("Done in")) {
    throw new Error(`easy-button live summary was not successful: ${JSON.stringify(state)}`);
  }
  const artifact = state.artifacts.find((item) => item.title === expectedArtifactTitle);
  if (!artifact || artifact.kind !== "table") {
    throw new Error(`easy-button live table artifact was missing: ${JSON.stringify(state)}`);
  }
  if (state.highlights.length > 12) {
    throw new Error(`easy-button live highlights exceeded cap: ${JSON.stringify(state)}`);
  }
}

function assertLiveEasyRunSnapshot(snapshot) {
  const latestRun = snapshot.latestRun;
  if (!latestRun || latestRun.status !== "completed" || latestRun.narratorStatus !== "ok") {
    throw new Error(`easy-button live snapshot run was not healthy: ${JSON.stringify(snapshot)}`);
  }
  if (latestRun.artifactCount < 1 || snapshot.artifacts.length < 1) {
    throw new Error(`easy-button live snapshot has no artifacts: ${JSON.stringify(snapshot)}`);
  }
  if (!snapshot.artifacts.some((artifact) => artifact.title === expectedArtifactTitle)) {
    throw new Error(
      `easy-button live snapshot is missing titled artifact: ${JSON.stringify(snapshot)}`,
    );
  }
  if (latestRun.highlightCount > 12 || snapshot.highlights.length > 12) {
    throw new Error(
      `easy-button live snapshot highlights exceeded cap: ${JSON.stringify(snapshot)}`,
    );
  }
}

async function assertEasyButtonLiveRecordingEvidence(recordingDir) {
  const [backendRows, ipcRows] = await Promise.all([
    readJsonLines(join(recordingDir, "backend-http.jsonl")),
    readJsonLines(join(recordingDir, "ipc.jsonl")),
  ]);
  assertRecordedBackendPath(backendRows, "/easy-runs/start");
  assertRecordedBackendPath(backendRows, "/easy-runs/snapshot");
  assertRecordedBackendPath(backendRows, "/easy-runs/events");
  assertRecordedIpcChannel(ipcRows, "easy-run:start");
  assertRecordedIpcChannel(ipcRows, "easy-run:snapshot");
}

function assertRecordedBackendPath(rows, path) {
  if (
    !rows.some(
      (row) => row.type === "backend_http_response" && row.status === 200 && row.url.includes(path),
    )
  ) {
    throw new Error(`easy-button live recording missing backend path ${path}`);
  }
}

function assertRecordedIpcChannel(rows, channel) {
  if (!rows.some((row) => row.type === "ipc_finish" && row.channel === channel)) {
    throw new Error(`easy-button live recording missing IPC channel ${channel}`);
  }
}

async function readJsonLines(path) {
  const raw = await readFile(path, "utf8");
  return raw
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line));
}

async function safeEasyButtonState(client) {
  try {
    return await client.evaluate(easyButtonStateExpression());
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

function workspaceIdExpression() {
  return `(() => {
    const area = document.querySelector('[data-testid="workspace-layout-area"]');
    return area instanceof HTMLElement ? area.dataset.workspaceId ?? "" : "";
  })()`;
}

function easyButtonStateExpression() {
  return driverCallExpression("easyButtonPaneState");
}
