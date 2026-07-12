#!/usr/bin/env node
/* global console, fetch */

import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";
import process from "node:process";

import { analyzeTerminalLatencyRecording } from "../../scripts/analyze-terminal-latency-recording.mjs";
import {
  assertBuildExists,
  parseElectronHarnessArgs,
  timestampedRecordingDir,
  writeJson,
  writeLatestRecordingPointer,
} from "./electron-cdp-harness.mjs";
import {
  startExternalScriptedBackend,
  stopExternalBackend,
} from "./chat-workflow-external-backend.mjs";
import { startNetworkDelayProxy } from "./network-delay-proxy.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../../..");
const profiles = [
  { name: "local", rttMs: 0 },
  { name: "40ms", rttMs: 40 },
  { name: "100ms", rttMs: 100 },
];
const transportP50BudgetMs = 15;
const transportP95BudgetMs = 35;
const mainToXtermP95BudgetMs = 8;
const oneFrameAt60HzMs = 1000 / 60;
const options = parseElectronHarnessArgs(process.argv.slice(2));

if (options.help) {
  console.log(
    "Usage: node desktop/tests/electron/terminal-latency-profiles-workflow.test.mjs [--skip-build] [--visible] [--keep-artifacts] [--artifact-dir <dir>]",
  );
  process.exit(0);
}
if (!options.skipBuild) assertBuildExists();

const artifactRoot = options.artifactDir || timestampedRecordingDir("terminal-latency-profiles");
await writeLatestRecordingPointer("terminal-latency-profiles", artifactRoot);
await mkdir(artifactRoot, { recursive: true });
const results = [];

for (const profile of profiles) {
  results.push(await runProfile(profile));
}
await writeJson(join(artifactRoot, "summary.json"), { profiles: results, status: "passed" });
console.log(`Electron terminal latency profiles workflow passed: ${artifactRoot}`);

async function runProfile(profile) {
  const profileDir = join(artifactRoot, profile.name);
  const tempRoot = await mkdtemp(join(tmpdir(), `setta-terminal-latency-${profile.name}-`));
  const backendFixture = { appDataDir: join(tempRoot, "backend-app-data") };
  const workspaceRoot = join(tempRoot, "workspace");
  const registrySource = join(tempRoot, "registry");
  let backend;
  let proxy;
  try {
    await mkdir(workspaceRoot, { recursive: true });
    backend = await startExternalScriptedBackend(backendFixture, repoRoot);
    const target = new URL(backend.url);
    proxy = await startNetworkDelayProxy({
      delayMs: profile.rttMs / 2,
      targetHost: target.hostname,
      targetPort: Number(target.port),
    });
    const runtimeInfo = await fetchRuntimeInfo(proxy.url);
    await writeRegistryFixture(registrySource, runtimeInfo, proxy.url, backend.token);
    await runTerminalWorkflow(profileDir, {
      host: proxy.host,
      registrySource,
      workspaceRoot,
    });
    const workflowSummary = JSON.parse(await readFile(join(profileDir, "summary.json"), "utf8"));
    if (!workflowSummary.fastTypingOutputObserved) {
      throw new Error(`${profile.name}: fast-typing ordered output marker was not preserved`);
    }
    const report = await analyzeTerminalLatencyRecording(profileDir);
    assertProfileBudgets(profile, report);
    await writeJson(join(profileDir, "latency-report.json"), report);
    return {
      fastTypingOutputObserved: true,
      latencyReport: join(profileDir, "latency-report.json"),
      name: profile.name,
      rttMs: profile.rttMs,
      status: "passed",
    };
  } catch (error) {
    await writeJson(join(profileDir, "profile-failure.json"), {
      error: error instanceof Error ? error.message : String(error),
      profile,
    }).catch(() => {});
    throw error;
  } finally {
    await proxy?.stop().catch(() => {});
    await stopExternalBackend(backend, { force: true });
    await rm(tempRoot, { force: true, recursive: true });
  }
}

async function fetchRuntimeInfo(baseUrl) {
  const response = await fetch(`${baseUrl}/runtime/info`);
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`runtime info through delay proxy failed with ${response.status}: ${body}`);
  }
  return JSON.parse(body);
}

async function writeRegistryFixture(directory, runtimeInfo, baseUrl, deviceToken) {
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, "known-runtimes.json"),
    `${JSON.stringify(
      {
        active_runtime_id: runtimeInfo.runtimeId,
        runtimes: [
          {
            base_url: baseUrl,
            device_token: deviceToken,
            display_name: `${runtimeInfo.displayName} latency proxy`,
            is_local: false,
            last_connected: null,
            runtime_id: runtimeInfo.runtimeId,
          },
        ],
        schema_version: 1,
      },
      null,
      2,
    )}\n`,
    { mode: 0o600 },
  );
  await writeFile(
    join(directory, "runtime-secrets.json"),
    `${JSON.stringify({ schema_version: 1, secrets: [] }, null, 2)}\n`,
    { mode: 0o600 },
  );
}

async function runTerminalWorkflow(artifactDir, remote) {
  const args = [
    join(scriptDir, "terminal-workflow.test.mjs"),
    "--skip-build",
    "--artifact-dir",
    artifactDir,
  ];
  if (options.visible) args.push("--visible");
  const child = spawn(process.execPath, args, {
    cwd: repoRoot,
    env: {
      ...process.env,
      SETTA_E2E_REMOTE_RUNTIME_HOST: remote.host,
      SETTA_E2E_REMOTE_WORKSPACE_ROOT: remote.workspaceRoot,
      SETTA_E2E_RUNTIME_REGISTRY_SOURCE: remote.registrySource,
      SETTA_E2E_SKIP_TAILSCALE_ROUTE: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => (output += chunk));
  child.stderr.on("data", (chunk) => (output += chunk));
  const exitCode = await new Promise((resolvePromise, reject) => {
    child.once("error", reject);
    child.once("exit", resolvePromise);
  });
  await writeFile(join(artifactDir, "profile-workflow-output.log"), output);
  if (exitCode !== 0) {
    throw new Error(`terminal workflow exited with ${exitCode}\n${output}`);
  }
}

function assertProfileBudgets(profile, report) {
  requireSamples(profile, "input", report.input.sampleCount);
  const dispatchToAck = report.input.stagesMs.dispatchToAck;
  assertAtMost(
    profile,
    "input transport overhead p50",
    transportOverhead(profile, "p50", dispatchToAck.p50),
    transportP50BudgetMs,
  );
  assertAtMost(
    profile,
    "input transport overhead p95",
    transportOverhead(profile, "p95", dispatchToAck.p95),
    transportP95BudgetMs,
  );

  const interactive = report.output.interactive;
  requireSamples(profile, "interactive immediate output", interactive.sampleCount);
  assertAtMost(
    profile,
    "interactive main receipt to xterm write p95",
    interactive.stagesMs.mainToXtermWrite.p95,
    mainToXtermP95BudgetMs,
    true,
  );
  assertAtMost(
    profile,
    "interactive xterm write to next paint p95",
    interactive.stagesMs.xtermWriteToPaint.p95,
    oneFrameAt60HzMs,
    true,
  );
}

function transportOverhead(profile, percentile, dispatchToAckMs) {
  if (!Number.isFinite(dispatchToAckMs)) {
    throw new Error(`${profile.name}: input dispatch-to-ack ${percentile} is missing`);
  }
  return dispatchToAckMs - profile.rttMs;
}

function requireSamples(profile, label, count) {
  if (!Number.isInteger(count) || count <= 0) {
    throw new Error(`${profile.name}: recording has no ${label} samples`);
  }
}

function assertAtMost(profile, label, actual, budget, strict = false) {
  if (!Number.isFinite(actual) || (strict ? actual >= budget : actual > budget)) {
    throw new Error(
      `${profile.name}: ${label} was ${actual} ms, budget ${strict ? "<" : "<="} ${budget} ms`,
    );
  }
}
