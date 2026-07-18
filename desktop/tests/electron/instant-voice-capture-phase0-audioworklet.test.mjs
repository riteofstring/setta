#!/usr/bin/env node
/* global console */

import { readFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  assertBuildExists,
  captureScreenshot,
  createElectronFixture,
  launchElectronCdpContext,
  parseElectronHarnessArgs,
  stopElectronCdpContext,
  timestampedRecordingDir,
  waitForSelector,
  writeJson,
  writeLatestRecordingPointer,
} from "./electron-cdp-harness.mjs";

const options = parseElectronHarnessArgs(process.argv.slice(2));
const workflowName = "instant-voice-capture-phase0-audioworklet";
const scriptDir = dirname(fileURLToPath(import.meta.url));
const browserFixturePath = join(scriptDir, "instant-voice-capture-phase0-audioworklet-fixture.js");
const workletPath = join(scriptDir, "instant-voice-capture-phase0-audioworklet-worklets.js");

if (options.help) {
  console.log(
    "Usage: node desktop/tests/electron/instant-voice-capture-phase0-audioworklet.test.mjs [--skip-build] [--visible] [--keep-artifacts] [--artifact-dir <dir>]",
  );
  process.exit(0);
}

if (!options.skipBuild) {
  assertBuildExists();
}

const artifactDir = options.artifactDir || timestampedRecordingDir(workflowName);
await writeLatestRecordingPointer(workflowName, artifactDir);
const fixture = await createElectronFixture(workflowName);
let context = null;

try {
  context = await launchElectronCdpContext({
    artifactDir,
    fixture,
    visible: options.visible,
  });
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
  const browserFixture = await readFile(browserFixturePath, "utf8");
  const workletSource = await readFile(workletPath, "utf8");
  await context.client.evaluate(browserFixture);
  const result = await context.client.evaluate(
    `globalThis.__settaInstantVoiceCaptureAudioWorkletFeasibility.run(${JSON.stringify({
      simulatedWebRTCReadyDelayMs: 300,
      workletSource,
    })})`,
  );
  assertFeasibilityResult(result);
  const summary = {
    artifactDir,
    result,
    status: "passed",
    workflowName,
  };
  await writeJson(join(artifactDir, "summary.json"), summary);
  await writeJson(join(artifactDir, "audioworklet-feasibility-summary.json"), summary);
  await captureScreenshot(context.client, join(artifactDir, "complete.png"));
  console.log(`Electron instant voice capture AudioWorklet feasibility passed: ${artifactDir}`);
} catch (error) {
  if (context) {
    await captureScreenshot(context.client, join(artifactDir, "failure.png")).catch(() => {});
  }
  await writeJson(join(artifactDir, "summary.json"), {
    artifactDir,
    error: error instanceof Error ? error.message : String(error),
    status: "failed",
    workflowName,
  });
  throw error;
} finally {
  await stopElectronCdpContext(context);
  await rm(fixture.tempRoot, { force: true, recursive: true });
}

function assertFeasibilityResult(result) {
  assertPassedResult(result);
  assertRequiredEvents(result.events, [
    "audio_context_resumed",
    "worklet_module_loaded",
    "audio_graph_created",
    "webrtc_track_added",
    "webrtc_ready",
    "input_prefix_retained",
    "release_sent",
    "output_prefix_observed",
    "input_tail_retained",
    "raw_track_stopped",
    "output_tail_observed",
    "gate_drained",
  ]);
  assertProcessedGraph(result.graph);
  assertStoppedRawTrack(result.graph);
  assertLoopbackPeer(result.peer);
  assertFiniteMeasurements(result.measurements);
  assertTimeline(result.events);
}

function assertPassedResult(result) {
  if (!result || result.status !== "passed") {
    throw new Error(`AudioWorklet feasibility did not pass: ${JSON.stringify(result)}`);
  }
}

function assertProcessedGraph(graph) {
  if (graph?.processedAudioTracks !== 1) {
    throw new Error(`processed stream track count drifted: ${JSON.stringify(graph)}`);
  }
  if (graph?.processedTrackKind !== "audio") {
    throw new Error(`processed stream was not audio: ${JSON.stringify(graph)}`);
  }
}

function assertStoppedRawTrack(graph) {
  if (graph?.rawTrackReadyState !== "ended") {
    throw new Error(`raw track did not stop: ${JSON.stringify(graph)}`);
  }
}

function assertLoopbackPeer(peer) {
  if (peer?.remoteTrackKind !== "audio") {
    throw new Error(`RTCPeerConnection remote track was not audio: ${JSON.stringify(peer)}`);
  }
  if (peer?.remoteTrackReadyState !== "live") {
    throw new Error(`RTCPeerConnection remote track was not live: ${JSON.stringify(peer)}`);
  }
  if (!peer?.offerHasAudioMLine) {
    throw new Error(`RTCPeerConnection offer did not negotiate audio: ${JSON.stringify(peer)}`);
  }
  if (!peer?.answerHasAudioMLine) {
    throw new Error(`RTCPeerConnection answer did not negotiate audio: ${JSON.stringify(peer)}`);
  }
}

function assertFiniteMeasurements(measurements) {
  for (const field of [
    "inputPrefixToReleaseMs",
    "rawStopToDrainMs",
    "rawStopToOutputTailMs",
    "releaseToOutputPrefixMs",
  ]) {
    assertFiniteMeasurement(field, measurements?.[field]);
  }
}

function assertFiniteMeasurement(field, value) {
  if (!Number.isFinite(value)) {
    throw new Error(`AudioWorklet feasibility measurement ${field} was not finite`);
  }
}

function assertTimeline(events) {
  const release = requiredEvent(events, "release_sent");
  const prefixInput = requiredEvent(events, "input_prefix_retained");
  const prefixOutput = requiredEvent(events, "output_prefix_observed");
  const rawStop = requiredEvent(events, "raw_track_stopped");
  const tailOutput = requiredEvent(events, "output_tail_observed");
  const webRTCReady = requiredEvent(events, "webrtc_ready");
  if (webRTCReady.performanceMs < prefixInput.performanceMs) {
    throw new Error("RTCPeerConnection readiness happened before the prefix marker was retained");
  }
  if (release.performanceMs < webRTCReady.performanceMs) {
    throw new Error("gate release happened before RTCPeerConnection readiness");
  }
  if (prefixOutput.performanceMs < release.performanceMs) {
    throw new Error("prefix marker was emitted before release");
  }
  if (tailOutput.performanceMs < rawStop.performanceMs) {
    throw new Error("tail marker was emitted before raw track stop");
  }
}

function assertRequiredEvents(events, names) {
  if (!Array.isArray(events)) {
    throw new Error("AudioWorklet feasibility events were not recorded");
  }
  const eventNames = new Set(events.map((event) => event.name));
  for (const name of names) {
    if (!eventNames.has(name)) {
      throw new Error(`AudioWorklet feasibility missing event ${name}`);
    }
  }
}

function requiredEvent(events, name) {
  const event = events.find((candidate) => candidate.name === name);
  if (!event) {
    throw new Error(`AudioWorklet feasibility missing event ${name}`);
  }
  return event;
}
