#!/usr/bin/env node
/* global Buffer, URL, console, process */

import { appendFile, chmod, mkdir, writeFile } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import { createHmac, createHash } from "node:crypto";
import { createServer } from "node:http";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertBuildExists,
  captureScreenshot,
  configureChatWorkflowHarness,
  createFixture,
  failureWithLogs,
  launchContext,
  pathTimestamp,
  stopLaunchedContext,
} from "./chat-workflow-harness.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(scriptDir, "../..");
const repoRoot = resolve(desktopRoot, "..");
const options = parseArgs(process.argv.slice(2));
configureChatWorkflowHarness({ visible: options.visible });
const recordingRoot = options.keepArtifacts
  ? join(repoRoot, "test-results", "electron-integration", "cloud-provision", pathTimestamp())
  : join(repoRoot, "test-results", "electron-integration", "cloud-provision");
const fakeProvisionRuntimeRoutes = {
  "GET /runtime/info": writeRuntimeInfoResponse,
  "POST /devices/list": writeDeviceListResponse,
  "POST /pairing/complete": writePairingCompleteResponse,
  "POST /setup/attestation": writeSetupAttestationResponse,
};

if (options.help) {
  console.log(
    "Usage: node desktop/tests/electron/cloud-provision-workflow.test.mjs [--visible] [--keep-artifacts]",
  );
  process.exit(0);
}

assertBuildExists();
await mkdir(recordingRoot, { recursive: true });

const fixture = await createFixture("cloud-provision");
const recordingDir = join(recordingRoot, "workflow");
let context = null;
let fakeRuntime = null;

try {
  const fakeProvisionStatePath = join(fixture.tempRoot, "fake-provision-state.json");
  const fakeRuntimeLogPath = join(recordingDir, "fake-runtime.jsonl");
  fakeRuntime = await startFakeProvisionRuntime(fakeProvisionStatePath, fakeRuntimeLogPath);
  const fakeSettaCLIPath = await writeFakeProvisionCLI(fixture.tempRoot, fakeProvisionStatePath);
  const fakeTailscaleBinDir = await writeFakeTailscaleCLI(fixture.tempRoot);
  context = await launchContext(fixture, recordingDir, {
    extraEnv: {
      PATH: `${fakeTailscaleBinDir}:${process.env.PATH ?? ""}`,
      SETTA_CLOUD_PROVISION_WATCH_POLL_INTERVAL_MS: "250",
      SETTA_CLOUD_PROVISION_WATCH_TIMEOUT_MS: "15000",
      SETTA_CLI_PATH: fakeSettaCLIPath,
      SETTA_E2E_RUNTIME_SECRET_STORE: "memory",
    },
  });

  const result = await context.client.driver("cloudProvisionWorkflow");

  if (
    result.options.defaultProvider !== "hetzner" ||
    result.options.defaultShape !== "dev-standard" ||
    result.resolution.constraints.intent !== "cheap box for agents" ||
    result.resolution.resolution.instanceType !== "cx42" ||
    result.resolution.resolution.region !== "fsn1" ||
    result.resolution.resolution.approval.secretFree !== true ||
    result.execution.creationRecord.recordId !== "hetzner:setta-worker" ||
    result.execution.creationRecord.status !== "succeeded" ||
    result.execution.plan.actionId !== "hetzner.server.create_runtime" ||
    result.snapshot.connection.status !== "connected" ||
    result.snapshot.activeRuntimeId !== "runtime_remote" ||
    result.snapshot.cloudResources[0]?.recordId !== "hetzner:setta-worker" ||
    result.snapshot.cloudResources[0]?.teardownReady !== true
  ) {
    throw new Error(`unexpected cloud provision result: ${JSON.stringify(result)}`);
  }

  await writeFile(
    join(recordingDir, "cloud-provision-summary.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(`Electron cloud provision workflow passed: ${recordingDir}`);
} catch (error) {
  if (context) {
    await captureScreenshot(context.client, join(recordingDir, "failure.png")).catch(() => {});
  }
  throw context ? failureWithLogs(error, context.electron.logs) : error;
} finally {
  await stopLaunchedContext(context);
  await fakeRuntime?.close();
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
      case "--visible":
        parsed.visible = true;
        break;
      default:
        throw new Error(`unknown cloud provision workflow argument: ${arg}`);
    }
  }
  return parsed;
}

async function writeFakeProvisionCLI(root, statePath) {
  const path = join(root, "fake-setta-provision.cjs");
  await writeFile(path, fakeProvisionCLISource(statePath), { mode: 0o700 });
  await chmod(path, 0o700);
  return path;
}

async function writeFakeTailscaleCLI(root) {
  const binDir = join(root, "fake-bin");
  const path = join(binDir, "tailscale");
  await mkdir(binDir, { recursive: true });
  await writeFile(
    path,
    [
      "#!/usr/bin/env node",
      "",
      "const args = process.argv.slice(2);",
      'if (args.join(" ") !== "status --json") {',
      '  throw new Error("unexpected tailscale args: " + args.join(" "));',
      "}",
      "process.stdout.write(JSON.stringify({",
      "  Peer: {",
      "    nodeFake: {",
      '      DNSName: "",',
      '      HostName: "setta-worker",',
      '      ID: "node-fake",',
      "      Online: true,",
      '      PublicKey: "node-public-key",',
      '      Tags: ["tag:setta-runtime"],',
      '      TailscaleIPs: ["127.0.0.1"]',
      "    }",
      "  }",
      '}) + "\\n");',
      "",
    ].join("\n"),
    { mode: 0o700 },
  );
  await chmod(path, 0o700);
  return binDir;
}

function fakeProvisionCLISource(statePath) {
  return [
    "#!/usr/bin/env node",
    "",
    "const { mkdirSync, readFileSync, writeFileSync } = require('node:fs');",
    "const { join } = require('node:path');",
    `const statePath = ${JSON.stringify(statePath)};`,
    "const args = process.argv.slice(2);",
    "function argValue(flag) {",
    "  const index = args.indexOf(flag);",
    "  if (index < 0 || index + 1 >= args.length) throw new Error('missing ' + flag);",
    "  return args[index + 1];",
    "}",
    'if (args[0] !== "provision") {',
    '  throw new Error("expected setta provision, got " + args.join(" "));',
    "}",
    "",
    'if (args[1] === "shapes" && args[2] === "--json") {',
    "  process.stdout.write(JSON.stringify({",
    "    ok: true,",
    '    defaultShape: "dev-standard",',
    "    catalog: {",
    "      schemaVersion: 1,",
    '      defaultProvider: "hetzner",',
    '      shapes: [{ id: "dev-standard", label: "Dev standard", guide: "4 vCPU / 16 GB RAM", cpuMin: 4, memoryGbMin: 16, diskFloorGb: 64 }],',
    "      providers: [{",
    '        id: "hetzner",',
    '        displayName: "Hetzner Cloud",',
    '        pricingUrl: "https://www.hetzner.com/cloud",',
    '        regionPreferences: ["fsn1"],',
    '        imageSelector: { kind: "image_alias", value: "ubuntu-24.04", description: "Hetzner stable Ubuntu image alias" },',
    '        mappings: { "dev-standard": { instanceType: "cx42", costClass: "standard" } }',
    "      }]",
    "    }",
    '  }) + "\\n");',
    "  process.exit(0);",
    "}",
    "",
    'if (args[1] === "resolve" && args[2] === "--json") {',
    '  if (!args.includes("--intent") || !args.includes("cheap box for agents")) {',
    '    throw new Error("resolve did not receive intent");',
    "  }",
    "  const resolution = {",
    '    provider: "hetzner", displayName: "Hetzner Cloud", shape: "dev-standard", source: "catalog", instanceType: "cx42", region: "fsn1", regionOptions: ["fsn1"], diskGb: 64,',
    "    machine: { cpus: 4, memoryGb: 16, diskGb: 64 },",
    '    imageSelector: { kind: "image_alias", value: "ubuntu-24.04", description: "Hetzner stable Ubuntu image alias" },',
    '    cost: { kind: "class", class: "standard", pricingUrl: "https://www.hetzner.com/cloud", description: "catalog cost class" },',
    "    approval: { requiresMutationApproval: true, commandPreview: [], secretFree: true }",
    "  };",
    "  process.stdout.write(JSON.stringify({",
    "    ok: true,",
    '    request: { provider: "hetzner", shape: "dev-standard", constraints: { intent: "cheap box for agents", regionPreference: "fsn1" } },',
    "    resolution,",
    "    candidates: [resolution]",
    '  }) + "\\n");',
    "  process.exit(0);",
    "}",
    "",
    'if (args[1] === "render-cloudinit" && args[2] === "--json") {',
    "  const state = {",
    "    attestationKey: argValue('--provision-attestation-key'),",
    "    expiresAt: argValue('--expires-at'),",
    "    pairingTokenHash: argValue('--pairing-token-hash'),",
    "    provisionId: argValue('--provision-id'),",
    "    runtimeName: argValue('--runtime-name')",
    "  };",
    "  writeFileSync(statePath, JSON.stringify(state, null, 2) + '\\n');",
    "  process.stdout.write(JSON.stringify({",
    "    ok: true,",
    "    cloudInit: '#cloud-config\\nsetta: true\\n',",
    `    cloudInitSha256: "${"b".repeat(64)}"`,
    "  }) + '\\n');",
    "  process.exit(0);",
    "}",
    "",
    'if (args[1] === "inspect" && args[2] === "--json") {',
    "  process.stdout.write(JSON.stringify({",
    "    ok: true,",
    "    provider: argValue('--provider'),",
    "    recordId: 'hetzner:setta-worker',",
    "    exists: false,",
    "    nextActions: []",
    "  }) + '\\n');",
    "  process.exit(0);",
    "}",
    "",
    'if (args[1] === "up" && args[2] === "--json" && args[3] === "--approve") {',
    "  const appDataDir = argValue('--app-data-dir');",
    "  const cloudInitPath = argValue('--cloud-init-file');",
    "  if (!readFileSync(cloudInitPath, 'utf8').includes('setta: true')) {",
    "    throw new Error('cloud-init file was not written');",
    "  }",
    "  mkdirSync(appDataDir, { recursive: true });",
    "  writeFileSync(join(appDataDir, 'provision-creations.json'), JSON.stringify({",
    "    schemaVersion: 1,",
    "    creations: [{",
    "      recordId: 'hetzner:setta-worker',",
    "      status: 'succeeded',",
    "      createdAt: '2026-07-07T10:00:00.000Z',",
    "      updatedAt: '2026-07-07T10:05:00.000Z',",
    "      provider: 'hetzner',",
    "      runtimeName: 'setta-worker',",
    "      expectedResourceName: 'setta-worker',",
    "      region: 'fsn1',",
    "      resourceId: '123',",
    "      teardownAction: { ready: true }",
    "    }]",
    "  }, null, 2) + '\\n');",
    "  process.stdout.write(JSON.stringify({",
    "    ok: true,",
    "    mode: 'executed',",
    "    provider: 'hetzner',",
    "    plan: {",
    "      actionId: 'hetzner.server.create_runtime',",
    "      provider: 'hetzner',",
    "      typedAction: 'create_runtime',",
    "      cliBinary: 'hcloud',",
    "      argv: ['hcloud', 'server', 'create', '--user-data-from-file', cloudInitPath],",
    "      mutating: true,",
    "      requiresApproval: true,",
    "      secretFree: true,",
    "      lastVerified: '2026-07-07',",
    "      fileInputs: [{ name: 'cloudInit', path: cloudInitPath, purpose: 'cloud-init user data with provisioning secrets', sizeBytes: 26, sha256: '" +
      "c".repeat(64) +
      "', sensitive: true }],",
    "      teardownActionId: 'hetzner.server.delete_runtime'",
    "    },",
    "    creationRecord: {",
    "      recordId: 'hetzner:setta-worker',",
    "      status: 'succeeded',",
    "      runtimeName: 'setta-worker',",
    "      resourceId: '123'",
    "    },",
    "    execution: { status: 'succeeded', resourceId: '123' },",
    "    warnings: []",
    "  }) + '\\n');",
    "  process.exit(0);",
    "}",
    "",
    'throw new Error("unexpected setta provision command " + args.join(" "));',
    "",
  ].join("\n");
}

async function startFakeProvisionRuntime(statePath, requestLogPath) {
  const server = createServer((request, response) => {
    void handleFakeProvisionRuntimeRequest(request, response, statePath, requestLogPath);
  });
  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(7345, "127.0.0.1", () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });
  return {
    close: () =>
      new Promise((resolveClose, rejectClose) => {
        server.close((error) => (error ? rejectClose(error) : resolveClose()));
      }),
  };
}

async function handleFakeProvisionRuntimeRequest(request, response, statePath, requestLogPath) {
  try {
    logFakeProvisionRuntimeRequest(requestLogPath, request, response);
    await routeFakeProvisionRuntimeRequest(request, response, statePath);
  } catch (error) {
    writeJSON(response, apiError("fake_runtime_failed", error.message), 500);
  }
}

function logFakeProvisionRuntimeRequest(path, request, response) {
  const entry = {
    at: new Date().toISOString(),
    method: request.method ?? "",
    url: request.url ?? "",
  };
  response.on("finish", () => {
    void appendFile(path, JSON.stringify({ ...entry, statusCode: response.statusCode }) + "\n");
  });
}

async function routeFakeProvisionRuntimeRequest(request, response, statePath) {
  const url = new URL(request.url ?? "/", "http://127.0.0.1:7345");
  const handler = fakeProvisionRuntimeRoutes[`${request.method ?? ""} ${url.pathname}`];
  return handler
    ? handler(request, response, statePath)
    : writeJSON(response, apiError("not_found", url.pathname), 404);
}

function writeRuntimeInfoResponse(_request, response) {
  writeJSON(response, runtimeInfo());
}

function writeDeviceListResponse(_request, response) {
  writeJSON(response, { devices: [] });
}

async function writeSetupAttestationResponse(request, response, statePath) {
  const state = await readProvisionState(statePath);
  const body = await readJSONRequest(request);
  const nodeFingerprint = body.nodeFingerprint;
  const nonce = body.nonce;
  const provisionId = body.provisionId;
  writeJSON(response, {
    algorithm: "hmac-sha256-v1",
    attestation: computeSetupAttestation({
      attestationKey: state.attestationKey,
      nodeFingerprint,
      nonce,
      provisionId,
      runtimeId: "runtime_remote",
    }),
    expiresAt: state.expiresAt,
    nodeFingerprint,
    nonce,
    provisionId,
    runtimeId: "runtime_remote",
  });
}

async function writePairingCompleteResponse(request, response, statePath) {
  const state = await readProvisionState(statePath);
  const body = await readJSONRequest(request);
  const hash = createHash("sha256").update(String(body.pairingToken)).digest("hex");
  if (hash !== state.pairingTokenHash) {
    writeJSON(response, apiError("bad_pairing", "bad pairing token"), 401);
    return;
  }
  writeJSON(response, {
    deviceId: "device_desktop",
    deviceToken: "device_token_remote",
    protocolVersion: 9,
    runtimeId: "runtime_remote",
  });
}

async function readProvisionState(statePath) {
  return JSON.parse(await readFile(statePath, "utf8"));
}

async function readJSONRequest(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function runtimeInfo() {
  return {
    backendName: "setta-backend",
    backendVersion: "test",
    displayName: "setta-worker",
    featureSet: {
      features: ["device_pairing_url", "runtime_web_app", "web_push"],
      version: 1,
    },
    infrastructureProvider: {
      displayName: "Hetzner",
      iconUrl: "https://www.hetzner.com/favicon.ico",
      id: "hetzner",
    },
    protocolVersion: 9,
    runtimeId: "runtime_remote",
    vapidPublicKey: "test-vapid-public-key",
  };
}

function computeSetupAttestation({
  attestationKey,
  nodeFingerprint,
  nonce,
  provisionId,
  runtimeId,
}) {
  const hmac = createHmac("sha256", attestationKey);
  for (const value of [
    "setta-setup-attestation-v1",
    runtimeId,
    provisionId,
    nonce,
    nodeFingerprint,
  ]) {
    hmac.update(value);
    hmac.update("\0");
  }
  return hmac.digest("hex");
}

function writeJSON(response, payload, status = 200) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(payload));
}

function apiError(code, message) {
  return {
    error: {
      activeExecution: null,
      code,
      message,
    },
  };
}
