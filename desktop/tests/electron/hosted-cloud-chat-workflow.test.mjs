#!/usr/bin/env node
/* global console */

import { execFile, spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { once } from "node:events";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { delimiter, dirname, join, resolve } from "node:path";
import process from "node:process";

import { driverCallExpression } from "./cdp-client.mjs";
import {
  assertBuildExists,
  clickEnabledButtonByAria,
  createElectronFixture,
  launchElectronCdpContext,
  parseElectronHarnessArgs,
  reloadPage,
  stopElectronCdpContext,
  waitForSelector,
  waitForState,
} from "./electron-cdp-harness.mjs";
import { backendProbe, waitForBackendState } from "./electron-workflow-harness.mjs";
import { installFakeTopicCodex } from "./fake-topic-codex-fixture.mjs";
import {
  assertDriverAction,
  conversationSurfaces,
  createTopic,
} from "./topic-conversation-fork-workflow.mjs";

const options = parseElectronHarnessArgs(process.argv.slice(2));
const workflowName = "hosted-cloud-chat";
const workflowTimeoutMs = 30_000;
const repositoryRoot = resolve(import.meta.dirname, "../../..");

if (options.help) {
  console.log(
    "Usage: node desktop/tests/electron/hosted-cloud-chat-workflow.test.mjs [--skip-build] [--visible] [--keep-artifacts] [--artifact-dir <dir>]",
  );
  process.exit(0);
}
if (!options.skipBuild) {
  assertBuildExists();
}

const fixture = await createElectronFixture(workflowName);
const artifactDir = options.artifactDir || join(fixture.tempRoot, "recording");
const controlPlane = await startControlPlaneFixture(fixture.tempRoot);
const fakeCodex = await installFakeTopicCodex(fixture);
let context = null;

try {
  context = await launchElectronCdpContext({
    artifactDir,
    extraEnv: {
      PATH: `${fakeCodex.binDir}${delimiter}${process.env.PATH ?? ""}`,
      SETTA_E2E_TOPIC_CODEX_STATE_PATH: fakeCodex.statePath,
      SETTA_HOSTED_ACCESS_SOCKET: controlPlane.socketPath,
    },
    fixture,
    unsetEnv: ["OPENAI_API_KEY"],
    visible: options.visible,
  });
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
  await context.client.installDriver();
  const backend = await backendProbe(artifactDir, context.client);

  const hosted = await ensureHostedPhoneAccess({
    backend,
    binary: controlPlane.binary,
    client: context.client,
    dataDirectory: controlPlane.dataDirectory,
    fixture,
    secretDirectory: controlPlane.secretDirectory,
  });
  const workspaceId = await openWorkspace(context.client);
  const topic = await createTopic(
    context.client,
    backend,
    workspaceId,
    "Hosted cloud chat",
    workflowTimeoutMs,
  );

  await exerciseHostedConversation({
    backend,
    client: context.client,
    conversationId: topic.id,
    workspaceId,
  });
  await reloadPage(context.client);
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
  await context.client.installDriver();
  const restored = await waitForConversationSurface(
    context.client,
    topic.id,
    (surface) =>
      surface.projectionStatus === "ready" &&
      surface.status === "failed" &&
      surface.artifactCount === 1,
  );
  if (restored.paletteId !== topic.paletteId) {
    throw new Error(
      `hosted conversation palette changed after reload: ${JSON.stringify(restored)}`,
    );
  }

  const replayed = await replayHostedProgress(context.client, hosted.intent.idempotencyKey);
  if (replayed.map((progress) => progress.state).join(",") !== "syncing_project,ready_on_phone") {
    throw new Error(`hosted progress replay was incomplete: ${JSON.stringify(replayed)}`);
  }

  await writeFile(
    join(artifactDir, "summary.json"),
    JSON.stringify(
      {
        conversationId: topic.id,
        hostedProgressStates: hosted.progress.map((progress) => progress.state),
        status: "passed",
        workspaceId,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`Hosted cloud chat Electron workflow passed: ${artifactDir}`);
} finally {
  await stopElectronCdpContext(context);
  await stopProcess(controlPlane.process);
  if (!options.keepArtifacts) {
    await execute("/usr/bin/trash", [fixture.tempRoot]);
  }
}

async function ensureHostedPhoneAccess({
  backend,
  binary,
  client,
  dataDirectory,
  fixture: electronFixture,
  secretDirectory,
}) {
  const credential = {
    device_id: `device_${randomBytes(16).toString("base64url")}`,
    token: randomBytes(32).toString("base64url"),
  };
  const intent = {
    client: { deviceId: credential.device_id, kind: "phone" },
    idempotencyKey: "electron-hosted-access-intent",
    projectId: "electron-hosted-project",
    requestedCapabilities: ["observe", "steer", "approve", "artifacts"],
    userId: "electron-hosted-user",
    workstreamId: "electron-hosted-workstream",
  };
  await client.evaluate(`(() => {
    globalThis.__settaHostedProgress = [];
    globalThis.__settaHostedProgressRelease = window.setta.hostedAccess.onProgress((progress) => {
      globalThis.__settaHostedProgress.push(progress);
    });
    return true;
  })()`);
  const preparing = await client.evaluate(
    `window.setta.hostedAccess.ensure(${JSON.stringify(intent)})`,
  );
  if (preparing.state !== "preparing_access" || preparing.cursor !== "1") {
    throw new Error(`hosted access did not begin: ${JSON.stringify(preparing)}`);
  }
  await client.evaluate(
    `window.setta.hostedAccess.subscribeProgress(${JSON.stringify({
      intentId: intent.idempotencyKey,
      lastEventId: preparing.cursor,
    })})`,
  );

  const runtimeCredentialFile = join(electronFixture.tempRoot, "hosted", "runtime-credential");
  await mkdir(dirname(runtimeCredentialFile), { mode: 0o700, recursive: true });
  await writeFile(runtimeCredentialFile, await backend.currentRuntimeCredential(), { mode: 0o600 });
  await chmod(runtimeCredentialFile, 0o600);
  const runtimeName = `setta-u-${createHash("sha256")
    .update(intent.userId)
    .digest("hex")
    .slice(0, 32)}`;
  await execute(
    binary,
    [
      "bootstrap",
      "--client-credential-file",
      join(electronFixture.tempRoot, "hosted", "client-credential.json"),
      "--client-credential-stdin",
      "--data-dir",
      dataDirectory,
      "--device-name",
      "Electron fixture phone",
      "--hosted-access-intent-id",
      intent.idempotencyKey,
      "--idempotency-key",
      "electron-hosted-bootstrap",
      "--project-id",
      intent.projectId,
      "--runtime-credential-file",
      runtimeCredentialFile,
      "--runtime-name",
      runtimeName,
      "--runtime-secret-ref",
      "electron_hosted_runtime",
      "--secret-dir",
      secretDirectory,
      "--user-id",
      intent.userId,
      "--workstream-id",
      intent.workstreamId,
    ],
    JSON.stringify(credential),
  );
  const progress = await waitForState(
    client,
    "globalThis.__settaHostedProgress",
    (events) => events.some((event) => event.state === "ready_on_phone"),
    workflowTimeoutMs,
  );
  const serialized = JSON.stringify({ intent, progress });
  if (/provider|sprite|runtime|region|machine|endpoint|pairing|wake/i.test(serialized)) {
    throw new Error("hosted access client surface exposed provider-facing fields");
  }
  await client.evaluate(
    `window.setta.hostedAccess.releaseProgress(${JSON.stringify({
      intentId: intent.idempotencyKey,
    })})`,
  );
  return { intent, progress: [preparing, ...progress] };
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

  await submitAndRequire(client, conversationId, "command approval denial");
  await waitForConversationSurface(
    client,
    conversationId,
    (surface) => surface.approvalId !== "" && surface.helperText === "Waiting for approval",
  );
  assertDriverAction(
    await client.driver("topicConversationDenyApproval", { conversationId }),
    "denied",
  );
  await waitForConversationSurface(
    client,
    conversationId,
    (surface) =>
      surface.state === "complete" && surface.status === "completed" && surface.approvalId === "",
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
      snapshot.turns.turns.length === 5 &&
      snapshot.turns.turns.at(-1)?.status === "failed" &&
      snapshot.queue.length === 0,
  );
  if (
    terminal.turns.turns.map((turn) => turn.status).join(",") !==
    "completed,completed,completed,cancelled,failed"
  ) {
    throw new Error(
      `hosted lifecycle turn statuses drifted: ${JSON.stringify(terminal.turns.turns)}`,
    );
  }
}

async function submitAndRequire(client, conversationId, text) {
  assertDriverAction(
    await client.driver("topicConversationSubmit", { conversationId, text }),
    "submitted",
  );
}

async function openWorkspace(client) {
  const initial = await waitForState(
    client,
    driverCallExpression("topicConversationWorkspaceOpenState", { workspaceId: "" }),
    (state) => state.openButtonReady || validWorkspaceId(state.workspaceId),
    workflowTimeoutMs,
  );
  if (!validWorkspaceId(initial.workspaceId)) {
    await clickEnabledButtonByAria(client, "Open project folder", workflowTimeoutMs);
  }
  const opened = await waitForState(
    client,
    driverCallExpression("topicConversationWorkspaceOpenState", { workspaceId: "" }),
    (state) => validWorkspaceId(state.workspaceId),
    workflowTimeoutMs,
  );
  return opened.workspaceId;
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

async function replayHostedProgress(client, intentId) {
  await client.evaluate(`(() => {
    globalThis.__settaHostedReplay = [];
    globalThis.__settaHostedReplayRelease = window.setta.hostedAccess.onProgress((progress) => {
      globalThis.__settaHostedReplay.push(progress);
    });
    return true;
  })()`);
  await client.evaluate(
    `window.setta.hostedAccess.subscribeProgress(${JSON.stringify({
      intentId,
      lastEventId: "1",
    })})`,
  );
  const replayed = await waitForState(
    client,
    "globalThis.__settaHostedReplay",
    (events) => events.some((event) => event.state === "ready_on_phone"),
    workflowTimeoutMs,
  );
  await client.evaluate(
    `window.setta.hostedAccess.releaseProgress(${JSON.stringify({ intentId })})`,
  );
  return replayed;
}

async function startControlPlaneFixture(root) {
  const binary = join(root, "control-plane", "bin", "setta-control-plane");
  await mkdir(dirname(binary), { mode: 0o700, recursive: true });
  await execute(join(repositoryRoot, "scripts/go.sh"), [
    "build",
    "-o",
    binary,
    "./cmd/setta-control-plane",
  ]);
  const dataDirectory = join(root, "control-plane", "data");
  const secretDirectory = join(root, "control-plane", "secrets");
  const child = spawn(binary, ["serve", "--host", "127.0.0.1", "--port", "0"], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      SETTA_CONTROL_PLANE_DATA_DIR: dataDirectory,
      SETTA_CONTROL_PLANE_SECRET_DIR: secretDirectory,
      SPRITE_TOKEN: "deterministic-electron-fixture-token",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await waitForControlPlaneReady(child);
  return {
    binary,
    dataDirectory,
    process: child,
    secretDirectory,
    socketPath: join(dataDirectory, "admin.sock"),
  };
}

async function waitForControlPlaneReady(child) {
  if (!child.stdout) {
    throw new Error("control-plane fixture has no stdout");
  }
  let buffered = "";
  for await (const chunk of child.stdout.iterator({ destroyOnReturn: false })) {
    buffered += chunk.toString();
    const newline = buffered.indexOf("\n");
    if (newline < 0) {
      continue;
    }
    const event = JSON.parse(buffered.slice(0, newline));
    if (event.event !== "control_plane_ready") {
      throw new Error(`control-plane fixture returned an invalid event: ${buffered}`);
    }
    return;
  }
  throw new Error("control-plane fixture exited before ready");
}

function execute(file, args, stdin = "") {
  return new Promise((resolvePromise, reject) => {
    const child = execFile(file, args, { cwd: repositoryRoot }, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolvePromise();
    });
    child.stdin?.end(stdin);
  });
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  const exited = once(child, "exit");
  child.kill("SIGTERM");
  await exited;
}

function validWorkspaceId(value) {
  return typeof value === "string" && value !== "";
}
