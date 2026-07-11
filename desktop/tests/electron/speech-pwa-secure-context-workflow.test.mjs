#!/usr/bin/env node
/* global console */

import { mkdtemp, mkdir, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";

import {
  assertBuildExists,
  captureScreenshot,
  clickEnabledButtonByAria,
  parseElectronHarnessArgs,
  timestampedRecordingDir,
  waitForSelector,
  waitForState,
  writeJson,
  writeLatestRecordingPointer,
} from "./electron-cdp-harness.mjs";
import {
  easyButtonStateExpression,
  workflowTimeoutMs,
  workspaceIdExpression,
} from "./easy-button-pane-actions.mjs";
import { startSpeechProviderFixture } from "./speech-provider-fixture.mjs";
import {
  startSpeechPWARuntimeFixture,
  stopSpeechPWARuntimeFixture,
} from "./speech-pwa-runtime-fixture.mjs";
import { launchWebPWACdpContext, stopWebPWACdpContext } from "./web-pwa-cdp-harness.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const options = parseElectronHarnessArgs(process.argv.slice(2));
const workflowName = "speech-pwa-secure-context";
const insecureHost = "setta-insecure.test";
const secureHost = "setta-secure.test";
const secureTranscript = "  secure remote pwa voice request  ";
const browserFixturePath = join(scriptDir, "speech-capture-browser-fixture.js");

if (options.help) {
  console.log(
    "Usage: node desktop/tests/electron/speech-pwa-secure-context-workflow.test.mjs [--skip-build] [--visible] [--keep-artifacts] [--artifact-dir <dir>]",
  );
  process.exit(0);
}
if (!options.skipBuild) {
  assertBuildExists();
}

const artifactDir = options.artifactDir || timestampedRecordingDir(workflowName);
await writeLatestRecordingPointer(workflowName, artifactDir);
await rm(artifactDir, { force: true, recursive: true });
await mkdir(artifactDir, { recursive: true });
const tempRoot = await mkdtemp(join(tmpdir(), "setta-speech-pwa-"));
const appDataDir = join(tempRoot, "app-data");
const workspaceRoot = join(tempRoot, "workspace");
await mkdir(workspaceRoot, { recursive: true });

const provider = await startSpeechProviderFixture();
let runtime = null;
let httpContext = null;
let httpsContext = null;

try {
  runtime = await startSpeechPWARuntimeFixture({ appDataDir, provider });
  console.log("PWA speech workflow: runtime started");
  const workspaceId = await openRuntimeWorkspace(runtime, workspaceRoot);
  console.log("PWA speech workflow: workspace opened");
  const httpPairingURL = await runtime.mintPairingURL();
  httpContext = await launchWebPWACdpContext({
    targetURL: pairingTarget(runtime.httpOrigin, httpPairingURL),
    visible: options.visible,
  });
  console.log("PWA speech workflow: plain HTTP browser launched");
  await preparePairedWebApp(httpContext.client);
  console.log("PWA speech workflow: plain HTTP browser paired");
  await waitForState(
    httpContext.client,
    workspaceIdExpression(),
    (selectedWorkspaceId) => selectedWorkspaceId === workspaceId,
    workflowTimeoutMs,
  );
  console.log("PWA speech workflow: plain HTTP workspace hydrated");
  const insecureState = await waitForEasyButton(httpContext.client, "unavailable");
  const insecureBoundary = await browserBoundary(httpContext.client);
  assertInsecureBoundary(insecureBoundary, insecureState);
  await httpContext.client.driver("easyButtonPaneClickControl");
  const focusedFallback = await waitForState(
    httpContext.client,
    easyButtonStateExpression(),
    (state) => state.inputFocused,
    workflowTimeoutMs,
  );
  if (focusedFallback.speechStatus !== "unavailable" || provider.requests.length !== 0) {
    throw new Error("plain HTTP fallback unexpectedly started speech capture");
  }
  await captureScreenshot(httpContext.client, join(artifactDir, "plain-http-unsupported.png"));
  assertNoPageErrors(httpContext, "plain HTTP");
  await stopWebPWACdpContext(httpContext, join(artifactDir, "plain-http-browser-output.log"));
  httpContext = null;

  const securePairingURL = await runtime.mintPairingURL();
  httpsContext = await launchWebPWACdpContext({
    targetURL: pairingTarget(runtime.httpsOrigin, securePairingURL),
    visible: options.visible,
  });
  console.log("PWA speech workflow: HTTPS browser launched");
  await installSpeechCaptureFixture(httpsContext.client);
  await preparePairedWebApp(httpsContext.client);
  console.log("PWA speech workflow: HTTPS browser paired");
  await waitForState(
    httpsContext.client,
    workspaceIdExpression(),
    (selectedWorkspaceId) => selectedWorkspaceId === workspaceId,
    workflowTimeoutMs,
  );
  console.log("PWA speech workflow: HTTPS workspace hydrated");
  const secureState = await waitForEasyButton(httpsContext.client, "configured");
  const secureBoundary = await waitForSecureBoundary(httpsContext.client);
  assertSecureBoundary(secureBoundary, secureState);
  await completeSecureSpeechCapture(httpsContext.client, workspaceId);
  await captureScreenshot(httpsContext.client, join(artifactDir, "https-voice-completed.png"));
  assertNoPageErrors(httpsContext, "HTTPS");
  await stopWebPWACdpContext(httpsContext, join(artifactDir, "https-browser-output.log"));
  httpsContext = null;

  assertProviderRequests(provider);
  provider.assertHealthy();
  runtime.secureProxy.assertHealthy();
  await assertNoSensitiveSpeechArtifacts(artifactDir, provider);
  await writeJson(join(artifactDir, "summary.json"), {
    artifactDir,
    http: insecureBoundary,
    https: secureBoundary,
    providerTranscriptionRequests: provider.requests.length,
    status: "passed",
    workspaceId,
  });
  console.log(`PWA speech secure-context workflow passed: ${artifactDir}`);
} catch (error) {
  await writeJson(join(artifactDir, "summary.json"), {
    artifactDir,
    error: error instanceof Error ? error.message : String(error),
    status: "failed",
  });
  throw error;
} finally {
  await stopWebPWACdpContext(httpContext, join(artifactDir, "plain-http-browser-output.log"));
  await stopWebPWACdpContext(httpsContext, join(artifactDir, "https-browser-output.log"));
  await stopSpeechPWARuntimeFixture(runtime);
  await provider.close();
  await rm(tempRoot, { force: true, recursive: true });
}

function pairingTarget(origin, pairingURL) {
  const target = new URL(origin);
  target.searchParams.set("pair", pairingURL);
  return target.toString();
}

async function preparePairedWebApp(client) {
  await waitForSelector(client, "#root");
  await waitForState(
    client,
    'typeof window.setta === "object"',
    (installed) => installed,
    workflowTimeoutMs,
  );
  await client.installDriver();
}

function waitForEasyButton(client, speechStatus) {
  return waitForState(
    client,
    easyButtonStateExpression(),
    (state) =>
      state.exists &&
      state.surfaceKind === "easy-button" &&
      state.easyState === "idle" &&
      state.speechStatus === speechStatus,
    workflowTimeoutMs,
  );
}

async function openRuntimeWorkspace(runtime, workspaceRoot) {
  const paired = await runtimeRequest(runtime.parsed.baseURL, "pairing/complete", {
    body: {
      clientDisplayName: "PWA Speech Setup",
      pairingToken: runtime.parsed.pairingToken,
    },
  });
  const opened = await runtimeRequest(runtime.parsed.baseURL, "workspaces/open", {
    body: { rootPath: workspaceRoot },
    token: paired.deviceToken,
  });
  const workspaceId = opened?.workspace?.id;
  if (!workspaceId) {
    throw new Error(
      `runtime workspace open returned an invalid response: ${JSON.stringify(opened)}`,
    );
  }
  await runtimeRequest(runtime.parsed.baseURL, "workspaces/ui/layout/save", {
    body: { layout: easyButtonLayout(workspaceId) },
    token: paired.deviceToken,
  });
  return workspaceId;
}

function easyButtonLayout(workspaceId) {
  const columnId = "workspace_column_pwa_speech";
  const paneId = "workspace_pane_pwa_speech";
  return {
    columns: [
      {
        columnId,
        idealWidthSpec: { unit: "proportion", value: 1 },
        index: 0,
        paneIds: [paneId],
        planeIndex: 0,
        previousProportionWidth: null,
        slotIndex: 0,
        widthSpec: { unit: "proportion", value: 1 },
      },
    ],
    focusedPaneId: paneId,
    panes: [
      {
        columnId,
        heat: 0,
        paneId,
        sequence: 0,
        subtitle: "one request surface",
        surfaceId: "workspace_surface_pwa_speech",
        surfaceKind: "easy-button",
        terminalConfig: null,
        title: "Easy Button",
        tone: "cyan",
        weight: 1,
        workflowNodeDetailsConfig: null,
      },
    ],
    schemaVersion: 1,
    workspaceId,
  };
}

async function runtimeRequest(baseURL, path, { body, token = "" }) {
  const headers = { "Content-Type": "application/json" };
  if (token !== "") {
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await globalThis.fetch(new URL(path, baseURL), {
    body: JSON.stringify(body),
    headers,
    method: "POST",
  });
  const responseBody = await response.text();
  if (!response.ok) {
    throw new Error(`runtime ${path} returned ${response.status}: ${responseBody}`);
  }
  return JSON.parse(responseBody);
}

function browserBoundary(client) {
  return client.evaluate(`({
    hostname: window.location.hostname,
    isSecureContext: globalThis.isSecureContext,
    mediaDevicesAvailable: typeof navigator.mediaDevices?.getUserMedia === "function",
    serviceWorkerAvailable: "serviceWorker" in navigator,
  })`);
}

async function waitForSecureBoundary(client) {
  return waitForState(
    client,
    `navigator.serviceWorker.getRegistration().then((registration) => ({
      hostname: window.location.hostname,
      isSecureContext: globalThis.isSecureContext,
      mediaDevicesAvailable: typeof navigator.mediaDevices?.getUserMedia === "function",
      serviceWorkerAvailable: "serviceWorker" in navigator,
      serviceWorkerScope: registration?.scope ?? "",
    }))`,
    (state) => state.serviceWorkerScope !== "",
    workflowTimeoutMs,
  );
}

function assertInsecureBoundary(boundary, state) {
  if (
    boundary.hostname !== insecureHost ||
    boundary.isSecureContext ||
    boundary.mediaDevicesAvailable ||
    boundary.serviceWorkerAvailable ||
    state.buttonAriaLabel !== "Focus Easy Button request input" ||
    state.voiceStatusText !== "Voice capture requires a secure HTTPS connection or localhost."
  ) {
    throw new Error(
      `plain HTTP did not fail at the secure-context boundary: ${JSON.stringify({ boundary, state })}`,
    );
  }
}

function assertSecureBoundary(boundary, state) {
  if (
    boundary.hostname !== secureHost ||
    !boundary.isSecureContext ||
    !boundary.mediaDevicesAvailable ||
    !boundary.serviceWorkerAvailable ||
    !boundary.serviceWorkerScope.startsWith(`https://${secureHost}:`) ||
    state.buttonAriaLabel !== "Start voice request" ||
    state.voiceStatusText !== ""
  ) {
    throw new Error(
      `HTTPS PWA did not expose voice capture: ${JSON.stringify({ boundary, state })}`,
    );
  }
}

async function installSpeechCaptureFixture(client) {
  await client.evaluate(await readFile(browserFixturePath, "utf8"));
}

async function completeSecureSpeechCapture(client, workspaceId) {
  await clickEnabledButtonByAria(client, "Start voice request", workflowTimeoutMs);
  await waitForCaptureState(client, (state) => state.capture === "requesting-permission");
  await callCaptureFixture(client, "allowMicrophone");
  await waitForCaptureState(
    client,
    (state) => state.capture === "connecting" && state.fixture.dataChannelLabel === "oai-events",
  );
  await callCaptureFixture(client, "openProviderSession");
  await waitForCaptureState(client, (state) => state.capture === "listening");
  await clickEnabledButtonByAria(client, "Finish voice request", workflowTimeoutMs);
  await waitForCaptureState(
    client,
    (state) => state.capture === "committing" && state.fixture.commitCount === 1,
  );
  await callCaptureFixture(client, "emitCompleted", secureTranscript);
  await waitForCaptureState(
    client,
    (state) => state.capture === "off" && state.fixture.activeTrackCount === 0,
  );
  await waitForState(
    client,
    `window.setta.easyRun.snapshot(${JSON.stringify(workspaceId)})`,
    (snapshot) => snapshot.latestRun?.requestText === secureTranscript.trim(),
    workflowTimeoutMs,
  );
}

function waitForCaptureState(client, isReady) {
  return waitForState(
    client,
    "globalThis.__settaSpeechCaptureFixture?.state() ?? {}",
    isReady,
    workflowTimeoutMs,
  );
}

function callCaptureFixture(client, method, argument) {
  const serializedArgument = argument === undefined ? "" : JSON.stringify(argument);
  return client.evaluate(
    `globalThis.__settaSpeechCaptureFixture[${JSON.stringify(method)}](${serializedArgument})`,
  );
}

function assertProviderRequests(provider) {
  if (
    provider.requests.length !== 1 ||
    provider.requests[0]?.path !== "/v1/realtime/client_secrets"
  ) {
    throw new Error(
      `PWA speech issued unexpected provider requests: ${JSON.stringify(provider.requests)}`,
    );
  }
}

function assertNoPageErrors(context, label) {
  if (context.pageErrors.length > 0) {
    throw new Error(`${label} PWA recorded page errors: ${JSON.stringify(context.pageErrors)}`);
  }
}

async function assertNoSensitiveSpeechArtifacts(root, provider) {
  const forbidden = [provider.apiKey, provider.clientSecret, provider.audioBase64];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isFile() || entry.name.endsWith(".png")) {
      continue;
    }
    const content = await readFile(join(root, entry.name), "utf8");
    if (forbidden.some((value) => content.includes(value))) {
      throw new Error(`PWA speech artifact contains sensitive provider data: ${entry.name}`);
    }
  }
}
