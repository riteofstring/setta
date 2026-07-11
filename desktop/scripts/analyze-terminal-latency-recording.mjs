#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";

const recordingDir = process.argv[2];
if (!recordingDir || process.argv.includes("--help")) {
  process.stdout.write(
    "Usage: node scripts/analyze-terminal-latency-recording.mjs <recording-dir>\n",
  );
  process.exit(recordingDir ? 0 : 1);
}

const root = resolve(recordingDir);
const [events, rendererEvents, manifest] = await Promise.all([
  readJsonLines(`${root}/events.jsonl`),
  readJsonLines(`${root}/renderer-events.jsonl`),
  readJSON(`${root}/manifest.json`),
]);

const inputSamples = collectInputSamples(events, rendererEvents);
const clockCalibration = calibrateRemoteClock(inputSamples);
applyRemoteClockCalibration(inputSamples, clockCalibration.offsetMs);
const outputSamples = collectOutputSamples(events, rendererEvents, clockCalibration.offsetMs);
const outputStages = [
  "emissionToMain",
  "mainToRenderer",
  "mainToXtermWrite",
  "rendererToXtermWrite",
  "xtermWriteToPaint",
  "emissionToPaint",
];
const report = {
  clockCalibration,
  input: {
    sampleCount: inputSamples.length,
    stagesMs: summarizeStages(inputSamples, [
      "rendererToPreload",
      "preloadToMain",
      "mainToDispatch",
      "dispatchToHandler",
      "handlerToPTYWrite",
      "dispatchToAck",
      "rendererToPTYWrite",
      "rendererToAck",
    ]),
  },
  output: {
    interactive: summarizeOutputSamples(
      outputSamples.filter((sample) => sample.outputSchedule === "immediate"),
      outputStages,
    ),
    bulk: summarizeOutputSamples(
      outputSamples.filter((sample) => sample.outputSchedule !== "immediate"),
      outputStages,
    ),
    replay: summarizeOutputSamples(
      outputSamples.filter((sample) => sample.outputSchedule === "replay"),
      outputStages,
    ),
  },
  recordingDir: root,
  runId: manifest.terminalLatencyRunId ?? "",
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

function collectInputSamples(events, rendererEvents) {
  const samples = collectRendererInputSamples(rendererEvents);
  attachMainInputTimes(samples, events);
  return [...samples.values()].flatMap(toInputLatencySample);
}

function collectRendererInputSamples(rendererEvents) {
  const samples = new Map();
  for (const event of rendererEvents) {
    if (event.type !== "terminal_input_renderer_received") continue;
    samples.set(inputKey(event), {
      inputSequence: event.inputSequence,
      clientId: event.clientId,
      rendererReceivedAt: event.at,
      runId: event.runId,
      sessionId: event.sessionId,
    });
  }
  return samples;
}

function attachMainInputTimes(samples, events) {
  for (const entry of events) {
    const payload = entry.payload;
    const sample = samples.get(inputKey(payload));
    if (!sample) continue;
    attachMainInputEntry(sample, entry.type, payload);
  }
}

function attachMainInputEntry(sample, type, payload) {
  if (type === "terminal_input_main_received") {
    sample.mainReceivedAt = payload.mainReceivedAt;
    sample.preloadReceivedAt = payload.preloadReceivedAt;
  }
  if (type === "terminal_input_stream_dispatched") {
    sample.dispatches ??= [];
    sample.dispatches.push(payload.dispatchedAt);
  }
  if (type !== "terminal_input_stream_ack_received") return;
  sample.handlerReceivedAt = payload.handlerReceivedAt;
  sample.ptyWriteCompletedAt = payload.ptyWriteCompletedAt;
  sample.ackReceivedAt = payload.ackReceivedAt;
}

function toInputLatencySample(sample) {
  const ackReceivedAt = Date.parse(sample.ackReceivedAt);
  const dispatchedAt = (sample.dispatches ?? [])
    .map(Date.parse)
    .filter((value) => Number.isFinite(value) && value <= ackReceivedAt)
    .sort((left, right) => right - left)[0];
  if (!Number.isFinite(dispatchedAt)) return [];
  const times = parseTimes(sample, [
    "rendererReceivedAt",
    "preloadReceivedAt",
    "mainReceivedAt",
    "handlerReceivedAt",
    "ptyWriteCompletedAt",
    "ackReceivedAt",
  ]);
  if (!times) return [];
  return [
    {
      clockOffsetEstimate:
        (times.handlerReceivedAt + times.ptyWriteCompletedAt) / 2 -
        (dispatchedAt + times.ackReceivedAt) / 2,
      dispatchToAck: times.ackReceivedAt - dispatchedAt,
      handlerToPTYWrite: times.ptyWriteCompletedAt - times.handlerReceivedAt,
      mainToDispatch: dispatchedAt - times.mainReceivedAt,
      preloadToMain: times.mainReceivedAt - times.preloadReceivedAt,
      rendererToPreload: times.preloadReceivedAt - times.rendererReceivedAt,
      rendererToAck: times.ackReceivedAt - times.rendererReceivedAt,
      remoteHandlerReceivedAt: times.handlerReceivedAt,
      remotePTYWriteCompletedAt: times.ptyWriteCompletedAt,
      localDispatchedAt: dispatchedAt,
      localRendererReceivedAt: times.rendererReceivedAt,
    },
  ];
}

function collectOutputSamples(events, rendererEvents, remoteClockOffsetMs) {
  const samples = collectMainOutputSamples(events);
  attachRendererOutputTimes(samples, rendererEvents);
  return [...samples.values()].flatMap((sample) =>
    toOutputLatencySample(sample, remoteClockOffsetMs),
  );
}

function collectMainOutputSamples(events) {
  const samples = new Map();
  for (const entry of events) {
    if (entry.type !== "terminal_event_forwarded" || entry.payload?.type !== "terminal.output")
      continue;
    samples.set(entry.payload.eventId, {
      emittedAt: entry.payload.emittedAt,
      mainReceivedAt: entry.at,
    });
  }
  return samples;
}

function attachRendererOutputTimes(samples, rendererEvents) {
  for (const event of rendererEvents) {
    if (event.type === "terminal_output_xterm_write") {
      assertOutputSchedule(event);
    }
    const sample = samples.get(event.eventId);
    if (!sample) continue;
    if (event.type === "terminal_output_renderer_received") sample.rendererReceivedAt = event.at;
    if (event.type === "terminal_output_xterm_write") {
      sample.xtermWriteAt = event.at;
      sample.outputSchedule = event.outputSchedule;
    }
    if (event.type === "terminal_output_painted") sample.paintedAt = event.at;
  }
}

function toOutputLatencySample(sample, remoteClockOffsetMs) {
  const times = parseTimes(sample, [
    "emittedAt",
    "mainReceivedAt",
    "rendererReceivedAt",
    "xtermWriteAt",
    "paintedAt",
  ]);
  if (!times) return [];
  return [
    {
      emissionToMain: times.mainReceivedAt - times.emittedAt + remoteClockOffsetMs,
      emissionToPaint: times.paintedAt - times.emittedAt + remoteClockOffsetMs,
      mainToXtermWrite: times.xtermWriteAt - times.mainReceivedAt,
      mainToRenderer: times.rendererReceivedAt - times.mainReceivedAt,
      outputSchedule: sample.outputSchedule,
      rendererToXtermWrite: times.xtermWriteAt - times.rendererReceivedAt,
      xtermWriteToPaint: times.paintedAt - times.xtermWriteAt,
    },
  ];
}

function assertOutputSchedule(event) {
  if (!["immediate", "coalesced", "replay"].includes(event.outputSchedule)) {
    throw new Error(
      `terminal_output_xterm_write event ${event.eventId ?? "<unknown>"} is missing a valid outputSchedule`,
    );
  }
}

function calibrateRemoteClock(inputSamples) {
  const best = inputSamples.reduce(
    (current, sample) =>
      current === null || sample.dispatchToAck < current.dispatchToAck ? sample : current,
    null,
  );
  return {
    minimumRoundTripMs: best?.dispatchToAck ?? null,
    offsetMs: best?.clockOffsetEstimate ?? 0,
    uncertaintyMs: best ? best.dispatchToAck / 2 : null,
  };
}

function applyRemoteClockCalibration(inputSamples, remoteClockOffsetMs) {
  for (const sample of inputSamples) {
    sample.dispatchToHandler =
      sample.remoteHandlerReceivedAt - sample.localDispatchedAt - remoteClockOffsetMs;
    sample.rendererToPTYWrite =
      sample.remotePTYWriteCompletedAt - sample.localRendererReceivedAt - remoteClockOffsetMs;
  }
}

function inputKey(value, sessionId = value?.sessionId, inputSequence = value?.inputSequence) {
  return `${value?.clientId ?? ""}:${sessionId ?? ""}:${inputSequence ?? 0}`;
}

function parseTimes(value, fields) {
  const result = {};
  for (const field of fields) {
    const parsed = Date.parse(value[field]);
    if (!Number.isFinite(parsed)) return null;
    result[field] = parsed;
  }
  return result;
}

function summarizeStages(samples, stages) {
  return Object.fromEntries(
    stages.map((stage) => [stage, distribution(samples.map((sample) => sample[stage]))]),
  );
}

function summarizeOutputSamples(samples, stages) {
  return {
    sampleCount: samples.length,
    stagesMs: summarizeStages(samples, stages),
  };
}

function distribution(values) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  return {
    maximum: sorted.at(-1) ?? null,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
  };
}

function percentile(sorted, fraction) {
  if (sorted.length === 0) return null;
  return sorted[Math.ceil(sorted.length * fraction) - 1];
}

async function readJsonLines(path) {
  const text = await readFile(path, "utf8");
  return text
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function readJSON(path) {
  return JSON.parse(await readFile(path, "utf8"));
}
