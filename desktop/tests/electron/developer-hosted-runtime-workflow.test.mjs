#!/usr/bin/env node
/* global console, fetch, setTimeout, URL */

import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, realpath, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { delimiter, join, resolve } from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

import { driverCallExpression } from "./cdp-client.mjs";
import {
  assertArtifactsExcludeMarkers,
  assertBuildExists,
  createElectronFixture,
  launchElectronCdpContext,
  parseElectronHarnessArgs,
  stopElectronCdpContext,
  waitForSelector,
  waitForState,
} from "./electron-cdp-harness.mjs";
import { waitForBackendState } from "./electron-workflow-harness.mjs";
import { installFakeTopicCodex } from "./fake-topic-codex-fixture.mjs";
import {
  assertDriverAction,
  conversationSurfaces,
  createTopic,
} from "./topic-conversation-fork-workflow.mjs";

const options = parseElectronHarnessArgs(process.argv.slice(2));
const repositoryRoot = resolve(import.meta.dirname, "../../..");
const workflowTimeoutMs = 45_000;

if (options.help) {
  console.log(
    "Usage: node desktop/tests/electron/developer-hosted-runtime-workflow.test.mjs [--skip-build] [--visible] [--keep-artifacts] [--artifact-dir <dir>]",
  );
  process.exit(0);
}
if (!options.skipBuild) {
  assertBuildExists();
}

const fixture = await createElectronFixture();
const hostedFixtureWorkspace = join(fixture.workspaceRoot, "Hosted test workspace");
await mkdir(hostedFixtureWorkspace);
const canonicalWorkspaceRoot = await realpath(hostedFixtureWorkspace);
const artifactDir = options.artifactDir || join(fixture.tempRoot, "recording");
const fakeCodex = await installFakeTopicCodex(fixture);
let remote = await startRemoteRuntime(join(fixture.tempRoot, "hosted-runtime-data"), fakeCodex);
const bootstrap = await enrollHostedDesktop(remote.pairingURL);
const controller = await startDeveloperHostedController(
  join(fixture.tempRoot, "developer-hosted.sock"),
  bootstrap,
  async () => {
    await stopProcess(remote.child);
    remote = null;
  },
);
let context = null;

try {
  context = await launchDeveloperDesktop(join(artifactDir, "first"));
  await waitForSelector(context.client, '[data-testid="runtime-picker"]');
  await context.client.installDriver();
  await context.client.evaluate(`(() => {
    globalThis.__developerHostedStatuses = [];
    globalThis.__releaseDeveloperHostedStatuses =
      window.setta.developerHostedRuntime.onStatus((status) => {
        globalThis.__developerHostedStatuses.push(status);
      });
    return true;
  })()`);
  await clickButtonByText(context.client, "Provision hosted runtime");
  const connected = await waitForDeveloperStatus(context.client, "connected");
  const connectedSnapshot = await waitForState(
    context.client,
    `window.setta.runtimes.current()`,
    (snapshot) =>
      snapshot.connection.status === "connected" &&
      snapshot.connection.runtimeId === bootstrap.runtimeId &&
      snapshot.runtimes.some(
        (runtime) =>
          runtime.runtimeId === bootstrap.runtimeId && runtime.active && runtime.managedHosted,
      ),
    workflowTimeoutMs,
  );
  const workspace = await waitForState(
    context.client,
    `window.setta.workspace.session()`,
    (session) =>
      session.selectedWorkspaceId !== "" &&
      session.activeWorkspaces.some(
        (candidate) =>
          candidate.rootPath === canonicalWorkspaceRoot &&
          candidate.displayName === "Hosted test workspace",
      ),
    workflowTimeoutMs,
  );
  const backend = runtimeBackend(bootstrap.baseUrl, bootstrap.token);
  const topic = await createTopic(
    context.client,
    backend,
    workspace.selectedWorkspaceId,
    "Hosted developer runtime",
    workflowTimeoutMs,
  );
  await exerciseHostedConversation({
    backend,
    client: context.client,
    conversationId: topic.id,
    workspaceId: workspace.selectedWorkspaceId,
  });
  const rendererSurface = JSON.stringify({
    connected,
    connectedSnapshot,
    statusEvents: await context.client.evaluate("globalThis.__developerHostedStatuses"),
  });
  requireNoSecret(rendererSurface, bootstrap);

  await stopElectronCdpContext(context);
  context = await launchDeveloperDesktop(join(artifactDir, "restart"));
  await waitForSelector(context.client, '[data-testid="runtime-picker"]');
  await context.client.installDriver();
  await waitForDeveloperStatus(context.client, "connected");
  await waitForState(
    context.client,
    `window.setta.runtimes.current()`,
    (snapshot) =>
      snapshot.connection.status === "connected" &&
      snapshot.connection.runtimeId === bootstrap.runtimeId,
    workflowTimeoutMs,
  );
  const restartedWorkspace = await context.client.evaluate("window.setta.workspace.session()");
  if (restartedWorkspace.selectedWorkspaceId !== workspace.selectedWorkspaceId) {
    throw new Error(
      `hosted workspace was not recovered after restart: ${JSON.stringify(restartedWorkspace)}`,
    );
  }
  await waitForConversationSurface(
    context.client,
    topic.id,
    (surface) =>
      surface.projectionStatus === "ready" &&
      surface.status === "failed" &&
      surface.artifactCount === 1,
  );

  await context.client.evaluate(
    `window.setta.developerHostedRuntime.destroy({ operationId: "electron-destroy-hosted" })`,
  );
  await waitForDeveloperStatus(context.client, "removed");
  await waitForState(
    context.client,
    `window.setta.runtimes.current()`,
    (snapshot) =>
      snapshot.connection.status === "connected" &&
      snapshot.runtimes.every((runtime) => !runtime.managedHosted),
    workflowTimeoutMs,
  );
  await waitForValue(
    () => ({ finalized: controller.finalized, providerPresent: controller.providerPresent() }),
    (state) => state.finalized && !state.providerPresent,
  );
  if (!controller.finalized || controller.providerPresent()) {
    throw new Error(
      `hosted removal was not finalized after provider absence: ${JSON.stringify({
        finalized: controller.finalized,
        providerPresent: controller.providerPresent(),
      })}`,
    );
  }
  const phases = controller.history.map((status) => status.phase);
  for (const required of [
    "preparing",
    "provisioning",
    "installing",
    "pairing",
    "connecting",
    "connected",
    "destroying",
    "removed",
  ]) {
    if (!phases.includes(required)) {
      throw new Error(`hosted phase ${required} was missing: ${JSON.stringify(phases)}`);
    }
  }
  await writeFile(
    join(artifactDir, "summary.json"),
    JSON.stringify(
      {
        phases,
        providerAbsent: !controller.providerPresent(),
        restartRecovered: true,
        runtimeId: bootstrap.runtimeId,
        status: "passed",
        conversationId: topic.id,
        workspaceId: workspace.selectedWorkspaceId,
      },
      null,
      2,
    ) + "\n",
  );
  await assertArtifactsExcludeMarkers(
    artifactDir,
    [bootstrap.token, bootstrap.deviceSecret],
    "developer hosted bootstrap credential",
  );
  console.log(`Developer hosted runtime Electron workflow passed: ${artifactDir}`);
} finally {
  await stopElectronCdpContext(context);
  await controller.close();
  if (remote) {
    await stopProcess(remote.child);
  }
  if (!options.keepArtifacts) {
    await executeTrash(fixture.tempRoot);
  }
}

async function exerciseHostedConversation({ backend, client, conversationId, workspaceId }) {
  await submitAndRequire(client, conversationId, "hold hosted Electron parent");
  await waitForConversationSurface(
    client,
    conversationId,
    (surface) => surface.state === "working",
  );
  await submitAndRequire(client, conversationId, "artifact hosted Electron queued");
  await waitForConversationSurface(client, conversationId, (surface) => surface.queueCount === 1);
  await submitAndRequire(client, conversationId, "steer alpha now");
  await waitForConversationSurface(
    client,
    conversationId,
    (surface) =>
      surface.state === "complete" &&
      surface.status === "completed" &&
      surface.queueCount === 0 &&
      surface.artifactCount === 1,
  );
  await submitAndRequire(client, conversationId, "hold hosted Electron cancellation");
  await waitForConversationSurface(
    client,
    conversationId,
    (surface) => surface.state === "working",
  );
  assertDriverAction(await client.driver("topicConversationStop", { conversationId }), "stopped");
  await waitForConversationSnapshot(
    backend,
    workspaceId,
    conversationId,
    (snapshot) => snapshot.turns.turns.at(-1)?.status === "cancelled",
  );
  await submitAndRequire(client, conversationId, "fail hosted Electron parent");
  await waitForConversationSurface(
    client,
    conversationId,
    (surface) => surface.state === "complete" && surface.status === "failed",
  );
  const terminal = await waitForConversationSnapshot(
    backend,
    workspaceId,
    conversationId,
    (snapshot) =>
      snapshot.turns.turns.length === 4 &&
      snapshot.turns.turns.at(-1)?.status === "failed" &&
      snapshot.queue.length === 0,
  );
  const statuses = terminal.turns.turns.map((turn) => turn.status).join(",");
  if (statuses !== "completed,completed,cancelled,failed") {
    throw new Error(`hosted lifecycle turn statuses drifted: ${JSON.stringify(statuses)}`);
  }
}

async function submitAndRequire(client, conversationId, text) {
  assertDriverAction(
    await client.driver("topicConversationSubmit", { conversationId, text }),
    "submitted",
  );
}

function waitForConversationSurface(client, conversationId, ready) {
  return waitForState(
    client,
    driverCallExpression("topicConversationSurfaceStates", {}),
    (state) => {
      const surface = conversationSurfaces(state.surfaces, conversationId)[0];
      return Boolean(surface && ready(surface));
    },
    workflowTimeoutMs,
  ).then((state) => conversationSurfaces(state.surfaces, conversationId)[0]);
}

function waitForConversationSnapshot(backend, workspaceId, conversationId, ready) {
  return waitForBackendState(
    () => backend.post("/conversations/snapshot/read", { conversationId, workspaceId }),
    ready,
    workflowTimeoutMs,
  );
}

function runtimeBackend(baseUrl, token) {
  return {
    post: async (path, payload) => {
      const response = await fetch(new URL(path.replace(/^\//, ""), baseUrl), {
        body: JSON.stringify(payload),
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      const body = await response.text();
      if (!response.ok) {
        throw new Error(`POST ${path} returned ${response.status}: ${body}`);
      }
      return JSON.parse(body);
    },
  };
}

function launchDeveloperDesktop(runArtifactDir) {
  return launchElectronCdpContext({
    artifactDir: runArtifactDir,
    extraEnv: {
      PATH: `${fakeCodex.binDir}${delimiter}${process.env.PATH ?? ""}`,
      SETTA_DEVELOPER_HOSTED_RUNTIME: "1",
      SETTA_E2E: "1",
      SETTA_E2E_DEVELOPER_HOSTED_WORKSPACE_PATH: canonicalWorkspaceRoot,
      SETTA_E2E_TOPIC_CODEX_STATE_PATH: fakeCodex.statePath,
      SETTA_HOSTED_ACCESS_SOCKET: controller.socketPath,
    },
    fixture,
    unsetEnv: ["OPENAI_API_KEY"],
    visible: options.visible,
  });
}

async function startDeveloperHostedController(socketPath, bootstrap, destroyProvider) {
  let current = null;
  let finalized = false;
  let providerPresent = true;
  const history = [];
  const histories = new Map();
  const listeners = new Map();
  const routeHandlers = new Map([
    ["GET /v1/developer-hosted-runtime/status", handleStatus],
    ["POST /v1/developer-hosted-runtime/ensure", handleEnsure],
    ["GET /v1/developer-hosted-runtime/events", handleEvents],
    ["GET /v1/developer-hosted-runtime/bootstrap", handleBootstrap],
    ["POST /v1/developer-hosted-runtime/connected", handleConnected],
    ["POST /v1/developer-hosted-runtime/credential", handleCredential],
    ["POST /v1/developer-hosted-runtime/destroy", handleDestroy],
    ["POST /v1/developer-hosted-runtime/finalize-removal", handleFinalize],
  ]);
  const server = createServer((request, response) => {
    void handle(request, response).catch((error) => {
      response.writeHead(500, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: String(error) }));
    });
  });

  function publish(operationId, phase, overrides = {}) {
    const events = histories.get(operationId) ?? [];
    const status = {
      operationId,
      cursor: String(events.length + 1),
      runtimeRegistryId: runtimeRegistryIdForPhase(phase, bootstrap.runtimeId),
      operationKind: operationKindForPhase(phase),
      phase,
      retryable: false,
      reasonCode: null,
      occurredAt: new Date().toISOString(),
      lastConnectedAt: phase === "connected" ? new Date().toISOString() : null,
      enforcedBudgetUsdMicros: 800_000,
      reportedUsageUsdMicros: null,
      deletionScheduledAt: new Date(Date.now() + 30 * 60_000).toISOString(),
      automaticDeletionWhileOffline: true,
      terminalOutcome: terminalOutcomeForPhase(phase),
      ...overrides,
    };
    events.push(status);
    histories.set(operationId, events);
    history.push(status);
    current = status;
    for (const response of listeners.get(operationId) ?? []) {
      writeSSE(response, status);
      if (status.terminalOutcome) {
        response.end();
      }
    }
    if (status.terminalOutcome) {
      listeners.delete(operationId);
    }
    return status;
  }

  async function handle(request, response) {
    const url = new URL(request.url, "http://developer-hosted.invalid");
    const route = routeHandlers.get(`${request.method} ${url.pathname}`);
    if (!route) {
      response.writeHead(404).end();
      return;
    }
    await route(request, response, url);
  }

  async function handleStatus(_request, response) {
    if (!current) {
      response.writeHead(204).end();
      return;
    }
    writeJSON(response, current);
  }

  async function handleEnsure(request, response) {
    const body = await readJSON(request);
    writeJSON(response, publish(body.operationId, "preparing"));
    for (const [index, phase] of [
      "provisioning",
      "installing",
      "pairing",
      "connecting",
    ].entries()) {
      setTimeout(() => publish(body.operationId, phase), (index + 1) * 75);
    }
  }

  async function handleEvents(request, response, url) {
    const operationId = url.searchParams.get("operationId");
    const cursor = Number(request.headers["last-event-id"] ?? "0");
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": "text/event-stream",
    });
    for (const status of histories.get(operationId) ?? []) {
      if (Number(status.cursor) > cursor) {
        writeSSE(response, status);
      }
    }
    if (current?.operationId === operationId && current.terminalOutcome) {
      response.end();
      return;
    }
    const operationListeners = listeners.get(operationId) ?? new Set();
    operationListeners.add(response);
    listeners.set(operationId, operationListeners);
    request.once("close", () => operationListeners.delete(response));
  }

  async function handleBootstrap(_request, response) {
    writeJSON(response, bootstrap);
  }

  async function handleConnected(request, response) {
    const body = await readJSON(request);
    if (body.runtimeRegistryId !== bootstrap.runtimeId) {
      response.writeHead(409).end();
      return;
    }
    writeJSON(response, publish(current.operationId, "connected"));
  }

  async function handleCredential(request, response) {
    const body = await readJSON(request);
    const matches =
      body.runtimeId === bootstrap.runtimeId &&
      body.deviceId === bootstrap.deviceId &&
      body.deviceSecret === bootstrap.deviceSecret;
    if (!matches) {
      response.writeHead(404).end();
      return;
    }
    writeJSON(response, {
      deviceId: bootstrap.deviceId,
      expiresAt: bootstrap.expiresAt,
      runtimeId: bootstrap.runtimeId,
      token: bootstrap.token,
    });
  }

  async function handleDestroy(request, response) {
    const body = await readJSON(request);
    writeJSON(response, publish(body.operationId, "destroying"));
    await destroyProvider();
    providerPresent = false;
    publish(body.operationId, "removed");
  }

  async function handleFinalize(_request, response) {
    finalized = true;
    writeJSON(response, { event: "removal_finalized", status: "removed" });
  }

  server.listen(socketPath);
  await once(server, "listening");
  return {
    close: () =>
      new Promise((resolvePromise, reject) => {
        for (const responses of listeners.values()) {
          for (const response of responses) {
            response.end();
          }
        }
        server.close((error) => (error ? reject(error) : resolvePromise()));
        server.closeAllConnections();
      }),
    get finalized() {
      return finalized;
    },
    history,
    providerPresent: () => providerPresent,
    socketPath,
  };
}

function runtimeRegistryIdForPhase(phase, runtimeId) {
  return new Set(["connecting", "connected", "destroying", "removed"]).has(phase)
    ? runtimeId
    : null;
}

function operationKindForPhase(phase) {
  return new Set(["destroying", "removed"]).has(phase) ? "destroy" : "ensure";
}

function terminalOutcomeForPhase(phase) {
  return (
    {
      connected: "connected",
      removed: "removed",
    }[phase] ?? null
  );
}

async function enrollHostedDesktop(pairingURL) {
  const parsed = new URL(pairingURL);
  const baseUrl = requiredParameter(parsed, "url");
  const runtimeId = requiredParameter(parsed, "rt");
  const pairingToken = requiredParameter(parsed, "tok");
  const response = await fetch(new URL("local-credentials/enroll", baseUrl), {
    body: JSON.stringify({
      clientDisplayName: "Developer hosted controller fixture",
      pairingToken,
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const enrollment = await response.json();
  if (!response.ok) {
    throw new Error(`hosted fixture enrollment failed: ${JSON.stringify(enrollment)}`);
  }
  return {
    baseUrl,
    deviceId: enrollment.deviceId,
    deviceSecret: enrollment.deviceSecret,
    expiresAt: enrollment.runtimeCredential.expiresAt,
    protocolVersion: enrollment.protocolVersion,
    runtimeId,
    token: enrollment.runtimeCredential.token,
    userId: enrollment.userId,
  };
}

async function startRemoteRuntime(appDataDir, fakeCodex) {
  await mkdir(appDataDir, { recursive: true });
  const child = spawn(
    join(repositoryRoot, "scripts/go.sh"),
    [
      "run",
      "./cmd/setta",
      "serve",
      "--app-data-dir",
      appDataDir,
      "--port",
      "0",
      "--local-credential-issuer",
    ],
    {
      cwd: repositoryRoot,
      detached: true,
      env: {
        ...process.env,
        PATH: `${fakeCodex.binDir}${delimiter}${process.env.PATH ?? ""}`,
        SETTA_E2E: "1",
        SETTA_E2E_TOPIC_CODEX_STATE_PATH: fakeCodex.statePath,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  child.logs = [];
  child.stdout.on("data", (chunk) => child.logs.push(chunk.toString()));
  child.stderr.on("data", (chunk) => child.logs.push(chunk.toString()));
  return { child, pairingURL: await waitForPairingURL(child) };
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
      throw new Error(`hosted runtime exited before pairing URL:\n${output}`);
    }
    await delay(100);
  }
  throw new Error(`timed out waiting for hosted runtime:\n${child.logs.join("")}`);
}

function waitForDeveloperStatus(client, phase) {
  return waitForState(
    client,
    `window.setta.developerHostedRuntime.status()`,
    (status) => status?.phase === phase,
    workflowTimeoutMs,
  );
}

async function waitForValue(read, ready) {
  const startedAt = Date.now();
  let value;
  while (Date.now() - startedAt < workflowTimeoutMs) {
    value = await read();
    if (ready(value)) {
      return value;
    }
    await delay(50);
  }
  throw new Error(`timed out waiting for value: ${JSON.stringify(value)}`);
}

async function clickButtonByText(client, text) {
  const clicked = await client.evaluate(`(() => {
    const button = Array.from(document.querySelectorAll("button")).find(
      (candidate) => candidate.textContent?.trim() === ${JSON.stringify(text)},
    );
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return false;
    }
    button.click();
    return true;
  })()`);
  if (!clicked) {
    throw new Error(`button ${JSON.stringify(text)} was not clickable`);
  }
}

function requireNoSecret(serialized, bootstrap) {
  for (const secret of [bootstrap.token, bootstrap.deviceSecret]) {
    if (serialized.includes(secret)) {
      throw new Error("developer hosted renderer surface exposed a bootstrap credential");
    }
  }
}

function requiredParameter(url, name) {
  const value = url.searchParams.get(name);
  if (!value) {
    throw new Error(`pairing URL omitted ${name}`);
  }
  return value;
}

function writeJSON(response, payload) {
  response.writeHead(200, { "Content-Type": "application/json" });
  response.end(JSON.stringify(payload));
}

function writeSSE(response, status) {
  response.write(
    `id: ${status.cursor}\nevent: developer_hosted_runtime_status\ndata: ${JSON.stringify(status)}\n\n`,
  );
}

async function readJSON(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk.toString();
  }
  return JSON.parse(body);
}

async function stopProcess(child) {
  if (!child) {
    return;
  }
  const exited =
    child.exitCode !== null || child.signalCode !== null ? Promise.resolve() : once(child, "close");
  signalProcessGroup(child, "SIGTERM");
  const stopped = await Promise.race([exited.then(() => true), delay(8_000).then(() => false)]);
  if (!stopped && child.exitCode === null && child.signalCode === null) {
    signalProcessGroup(child, "SIGKILL");
    await Promise.race([exited, delay(3_000)]);
  }
}

function signalProcessGroup(child, signal) {
  if (child.pid === undefined) {
    return;
  }
  if (process.platform === "win32") {
    child.kill(signal);
    return;
  }
  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) {
      throw error;
    }
  }
}

function executeTrash(path) {
  const child = spawn("/usr/bin/trash", [path], { stdio: "ignore" });
  return once(child, "exit");
}
