#!/usr/bin/env node
/* global console */

import { execFile, spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { once } from "node:events";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { delimiter, dirname, join, resolve } from "node:path";
import process from "node:process";

import {
  assertBuildExists,
  createElectronFixture,
  launchElectronCdpContext,
  parseElectronHarnessArgs,
  reloadPage,
  stopElectronCdpContext,
  waitForSelector,
  waitForState,
} from "./electron-cdp-harness.mjs";
import { backendProbe, openFixtureWorkspace } from "./electron-workflow-harness.mjs";
import { installFakeTopicCodex } from "./fake-topic-codex-fixture.mjs";
import {
  createDeterministicHostedWorkstream,
  exerciseDeterministicHostedDirector,
  waitForRestoredHostedDirector,
} from "./hosted-director-workflow-helpers.mjs";

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
const workloadLeases = await startWorkloadLeaseFixture(fixture.tempRoot);
const fakeCodex = await installFakeTopicCodex(fixture);
let context = null;

try {
  context = await launchElectronCdpContext({
    artifactDir,
    extraEnv: {
      PATH: `${fakeCodex.binDir}${delimiter}${process.env.PATH ?? ""}`,
      SETTA_E2E_TOPIC_CODEX_STATE_PATH: fakeCodex.statePath,
      SETTA_HOSTED_ACCESS_SOCKET: controlPlane.socketPath,
      SETTA_SPRITES_WORKLOAD_LEASE_SOCKET: workloadLeases.socketPath,
      SETTA_WORKLOAD_ACCOUNTING_CREDENTIAL_FILE: controlPlane.reportingCredentialFile,
      SETTA_WORKLOAD_ACCOUNTING_URL: controlPlane.baseURL,
    },
    fixture,
    unsetEnv: ["OPENAI_API_KEY"],
    visible: options.visible,
  });
  await waitForSelector(context.client, '[data-testid="director-command-center-shell"]');
  const backend = await backendProbe(artifactDir, context.client);

  const hosted = await ensureHostedPhoneAccess({
    backend,
    binary: controlPlane.binary,
    client: context.client,
    dataDirectory: controlPlane.dataDirectory,
    fixture,
    reportingCredentialFile: controlPlane.reportingCredentialFile,
    secretDirectory: controlPlane.secretDirectory,
  });
  const workspaceId = await openFixtureWorkspace(context.client, workflowTimeoutMs);
  await waitForSelector(context.client, '[data-testid="director-command-center-shell"]');
  const workstream = await createDeterministicHostedWorkstream(
    context.client,
    workspaceId,
    workflowTimeoutMs,
  );

  await exerciseDeterministicHostedDirector({
    backend,
    client: context.client,
    conversationId: workstream.conversationId,
    workspaceId,
    workstreamId: workstream.workstreamId,
    timeoutMs: workflowTimeoutMs,
  });
  await reloadPage(context.client);
  await waitForSelector(context.client, '[data-testid="director-command-center-shell"]');
  await waitForRestoredHostedDirector({
    backend,
    client: context.client,
    conversationId: workstream.conversationId,
    workspaceId,
    workstreamId: workstream.workstreamId,
    timeoutMs: workflowTimeoutMs,
  });

  const replayed = await replayHostedProgress(context.client, hosted.intent.idempotencyKey);
  if (replayed.map((progress) => progress.state).join(",") !== "syncing_project,ready_on_phone") {
    throw new Error(`hosted progress replay was incomplete: ${JSON.stringify(replayed)}`);
  }
  workloadLeases.requireBalanced();

  await writeFile(
    join(artifactDir, "summary.json"),
    JSON.stringify(
      {
        conversationId: workstream.conversationId,
        hostedProgressStates: hosted.progress.map((progress) => progress.state),
        status: "passed",
        workspaceId,
        workstreamId: workstream.workstreamId,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`Hosted cloud chat Electron workflow passed: ${artifactDir}`);
} finally {
  await stopElectronCdpContext(context);
  await stopProcess(controlPlane.process);
  await workloadLeases.close();
  if (!options.keepArtifacts) {
    await execute("/usr/bin/trash", [fixture.tempRoot]);
  }
}

async function startWorkloadLeaseFixture(root) {
  const socketPath = join(root, "sprites-management.sock");
  const requests = [];
  const state = { activeLease: null };
  const server = createServer((request, response) =>
    handleWorkloadLeaseRequest(request, response, requests, state),
  );
  server.listen(socketPath);
  await once(server, "listening");
  return {
    close: () =>
      new Promise((resolvePromise, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolvePromise();
        });
      }),
    requireBalanced: () => {
      const acquired = requests.filter(
        (request) => request.method === "POST" && request.path === "/v1/tasks",
      ).length;
      const released = requests.filter(
        (request) => request.method === "DELETE" && request.path === "/v1/tasks/setta-agent",
      ).length;
      if (acquired < 1 || acquired !== released || state.activeLease) {
        throw new Error(
          `hosted workload leases were not balanced: ${JSON.stringify({
            activeLease: state.activeLease,
            requests,
          })}`,
        );
      }
    },
    socketPath,
  };
}

async function handleWorkloadLeaseRequest(request, response, requests, state) {
  const body = await readRequestBody(request);
  requests.push({ method: request.method, path: request.url });
  if (request.method === "POST" && request.url === "/v1/tasks") {
    handleWorkloadLeaseAcquire(response, body, state);
    return;
  }
  if (request.method === "PUT" && request.url === "/v1/tasks/setta-agent") {
    handleWorkloadLeaseRenew(response, body, state);
    return;
  }
  if (request.method === "DELETE" && request.url === "/v1/tasks/setta-agent") {
    state.activeLease = null;
    response.writeHead(204).end();
    return;
  }
  response.writeHead(404).end();
}

async function readRequestBody(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk.toString();
  }
  return body;
}

function handleWorkloadLeaseAcquire(response, body, state) {
  const mutation = JSON.parse(body);
  if (state.activeLease) {
    response.writeHead(409).end();
    return;
  }
  const startedAt = new Date();
  state.activeLease = {
    name: mutation.name,
    started_at: startedAt.toISOString(),
    expires_at: new Date(startedAt.getTime() + mutation.expire * 1000).toISOString(),
  };
  writeWorkloadLease(response, 201, state.activeLease);
}

function handleWorkloadLeaseRenew(response, body, state) {
  if (!state.activeLease) {
    response.writeHead(404).end();
    return;
  }
  const mutation = JSON.parse(body);
  state.activeLease.expires_at = new Date(Date.now() + mutation.expire * 1000).toISOString();
  writeWorkloadLease(response, 200, state.activeLease);
}

function writeWorkloadLease(response, status, lease) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(lease));
}

async function ensureHostedPhoneAccess({
  backend,
  binary,
  client,
  dataDirectory,
  fixture: electronFixture,
  reportingCredentialFile,
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
      "--cpu-core-millionths",
      "1000000",
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
      "--runtime-release",
      "electron-hosted-test-release",
      "--memory-bytes",
      "512000000",
      "--runtime-secret-ref",
      "electron_hosted_runtime",
      "--secret-dir",
      secretDirectory,
      "--storage-bytes",
      "10000000000",
      "--user-id",
      intent.userId,
      "--workstream-id",
      intent.workstreamId,
    ],
    JSON.stringify(credential),
  );
  await execute(
    binary,
    [
      "admin",
      "rotate-runtime-reporting-credential",
      "--runtime-name",
      runtimeName,
      "--socket",
      join(dataDirectory, "admin.sock"),
    ],
    await readFile(reportingCredentialFile, "utf8"),
  );
  await execute(
    binary,
    [
      "admin",
      "record-accounting-event",
      "--runtime-name",
      runtimeName,
      "--socket",
      join(dataDirectory, "admin.sock"),
    ],
    JSON.stringify({
      action: "begin",
      at: new Date().toISOString(),
      event_id: "electron-hosted-provider-begin",
      kind: "provider",
    }),
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
  const reportingCredentialFile = join(
    root,
    "control-plane",
    "credentials",
    "runtime-reporter.json",
  );
  await execute(binary, [
    "generate-runtime-reporting-credential",
    "--output",
    reportingCredentialFile,
  ]);
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
  const ready = await waitForControlPlaneReady(child);
  return {
    baseURL: `http://${ready.address}`,
    binary,
    dataDirectory,
    process: child,
    reportingCredentialFile,
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
    return event;
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
