#!/usr/bin/env node
/* global console */

/**
 * Profiles both artifact particle fields against the unchanged graph scene.
 * This is a measurement workflow, not a test gate: it records CPU, GPU, and
 * frame-pacing summaries without asserting a threshold or changing quality.
 */

import { rm } from "node:fs/promises";
import { join } from "node:path";

import {
  assertBuildExists,
  captureScreenshot,
  createElectronFixture,
  launchElectronCdpContext,
  stopElectronCdpContext,
  timestampedRecordingDir,
  waitForState,
  writeJson,
  writeLatestRecordingPointer,
} from "./electron-cdp-harness.mjs";

const workflowName = "director-graph-artifact-profile";
const scenario = "one-active-workstream";
const readyTimeoutMs = 30_000;
const scenarioTimeoutMs = 120_000;
const artifactDir = timestampedRecordingDir(workflowName);

assertBuildExists();
await writeLatestRecordingPointer(workflowName, artifactDir);
const fixture = await createElectronFixture(workflowName);
let context = null;

try {
  context = await launchElectronCdpContext({
    artifactDir,
    extraEnv: {
      SETTA_E2E_WINDOW_HEIGHT: "982",
      SETTA_E2E_WINDOW_WIDTH: "1512",
    },
    fixture,
  });
  const { client } = context;
  const harnessUrl = await client.evaluate(
    `new URL("director-graph.html", window.location.href).toString()`,
  );
  await client.call("Page.navigate", { url: harnessUrl });
  const environment = await waitForState(
    client,
    `window.__settaDirectorGraphHarness?.environment() ?? { ready: false }`,
    (value) => value.ready === true,
    readyTimeoutMs,
  );
  if (!environment.webgl2 || !environment.gpuTimerQuery) {
    throw new Error(`graph profiling needs WebGL2 timer queries: ${JSON.stringify(environment)}`);
  }

  await runScenario(client, null);
  const graph = await runScenario(client, null);
  const particleFlow = await runScenario(client, "particle-flow", "artifact-profile-primary");
  await captureScreenshot(client, join(artifactDir, "artifact-particle-flow-a.png"));
  const particleFlowLater = await runScenario(client, "particle-flow", "artifact-profile-primary");
  await captureScreenshot(client, join(artifactDir, "artifact-particle-flow-b.png"));
  const particleFlowAlternate = await runScenario(
    client,
    "particle-flow",
    "artifact-profile-alternate",
  );
  await captureScreenshot(client, join(artifactDir, "artifact-particle-flow-alternate.png"));
  const fluid = await runScenario(client, "fluid", "artifact-profile-primary");
  await captureScreenshot(client, join(artifactDir, "artifact-large-fluid.png"));
  const result = {
    environment,
    fluid,
    graph,
    particleFlow,
    particleFlowAlternate,
    particleFlowLater,
    scenario,
    workflow: workflowName,
  };
  await writeJson(join(artifactDir, "profile.json"), result);
  console.log(JSON.stringify(compact(result), null, 2));
} finally {
  await stopElectronCdpContext(context);
  await rm(fixture.tempRoot, { force: true, recursive: true });
}

async function runScenario(client, style, artifactId) {
  await client.evaluate(
    `window.__settaDirectorGraphHarness.setArtifactParticles(${JSON.stringify(style)},${JSON.stringify(artifactId)})`,
  );
  const started = await client.evaluate(
    `window.__settaDirectorGraphHarness.start(${JSON.stringify(scenario)})`,
  );
  if (started.state !== "running") {
    throw new Error(`graph profile did not start: ${JSON.stringify(started)}`);
  }
  const status = await waitForState(
    client,
    `window.__settaDirectorGraphHarness.status()`,
    (value) => value.state === "done" || value.state === "failed",
    scenarioTimeoutMs,
  );
  if (status.state !== "done" || status.run === null) {
    throw new Error(`graph profile failed: ${status.error}`);
  }
  return status.run;
}

function compact(result) {
  const sample = (run) => ({
    cpuFrameMs: run.summary.cpuFrameMs,
    frameDeltaMs: run.summary.frameDeltaMs,
    frames: run.summary.frames,
    framesOverDroppedThreshold: run.summary.framesOverDroppedThreshold,
    gpuFrameMs: run.summary.gpuFrameMs,
    longTasks: run.summary.longTasks,
  });
  return {
    fluid: sample(result.fluid),
    graph: sample(result.graph),
    particleFlow: sample(result.particleFlow),
    particleFlowAlternate: sample(result.particleFlowAlternate),
    particleFlowLater: sample(result.particleFlowLater),
    renderer: result.environment.glRenderer,
    scenario: result.scenario,
    viewport: result.environment.viewport,
  };
}
