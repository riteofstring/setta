import { spawn } from "node:child_process";
import { cpus, machine, release, type as osType } from "node:os";
import process from "node:process";

import { repoRoot } from "./electron-cdp-harness.mjs";
import { phase0WorkloadForScenario } from "./workflow-graph-phase0-workloads.mjs";

export async function collectPhase0RunMetadata({
  client,
  nodeCount,
  recordingEnabled = true,
  scenario,
  skipBuild,
  syntheticScene,
}) {
  const [browserVersion, appVersions, browserMetrics, refreshRateEstimateHz, gitCommit] =
    await Promise.all([
      client.call("Browser.getVersion"),
      client.evaluate("window.setta.app.versions()"),
      client.evaluate(`(() => ({
        devicePixelRatio: window.devicePixelRatio,
        userAgent: navigator.userAgent,
        viewport: { height: window.innerHeight, width: window.innerWidth }
      }))()`),
      estimateDisplayRefreshRate(client),
      currentGitCommit(),
    ]);
  return {
    appVersions,
    benchmark: {
      interactionScript: interactionScriptForScenario(scenario),
      nodeCount,
      scenario,
      syntheticScene,
      workload: phase0WorkloadForScenario(scenario, nodeCount),
    },
    browserVersion,
    build: {
      mode: skipBuild ? "existing-production-electron-build" : "production-electron-build",
      recordingEnabled,
      timingThresholds: phase0TimingThresholdMode(),
      workflowGraphDebugEnabled: true,
    },
    display: {
      devicePixelRatio: browserMetrics.devicePixelRatio,
      refreshRateEstimateHz,
      viewport: browserMetrics.viewport,
    },
    gitCommit,
    machine: {
      cpuModel: cpus()[0]?.model ?? "",
      machine: machine(),
      osRelease: release(),
      osType: osType(),
      platform: process.platform,
    },
  };
}

function interactionScriptForScenario(scenario) {
  return scenario === "simple" || scenario === "small-active" || scenario === "small-trackpad"
    ? "node-drag, trackpad wheel pan, modifier wheel zoom"
    : "node-drag, pointer drag pan, wheel pan, modifier wheel zoom";
}

function phase0TimingThresholdMode() {
  return process.env.SETTA_WORKFLOW_GRAPH_PHASE0_REFERENCE_RUNNER === "1" ||
    process.env.SETTA_PERFORMANCE_REFERENCE_RUNNER === "1"
    ? "reference-hard"
    : "report-only";
}

async function estimateDisplayRefreshRate(client) {
  return client.evaluate(`(() => new Promise((resolve) => {
    const samples = [];
    let previous = 0;
    function step(now) {
      if (previous > 0) {
        samples.push(now - previous);
      }
      previous = now;
      if (samples.length >= 30) {
        const sorted = [...samples].sort((left, right) => left - right);
        const median = sorted[Math.floor(sorted.length / 2)];
        resolve(Number.isFinite(median) && median > 0 ? Math.round(1000 / median) : null);
        return;
      }
      requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }))()`);
}

async function currentGitCommit() {
  const { code, output } = await spawnForOutput("git", ["rev-parse", "HEAD"], { cwd: repoRoot });
  if (code !== 0) {
    throw new Error(`git commit lookup failed with code ${code}: ${output}`);
  }
  return output.trim();
}

function spawnForOutput(command, args, { cwd }) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolvePromise({ code, output });
    });
  });
}
