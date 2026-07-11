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
const [events, ipc, rendererEvents, manifest] = await Promise.all([
  readJsonLines(`${root}/events.jsonl`),
  readJsonLines(`${root}/ipc.jsonl`),
  readJsonLines(`${root}/renderer-events.jsonl`),
  readJSON(`${root}/manifest.json`),
]);

const inputSamples = collectInputSamples(events, ipc, rendererEvents);
const clockCalibration = calibrateRemoteClock(inputSamples);
applyRemoteClockCalibration(inputSamples, clockCalibration.offsetMs);
const outputSamples = collectOutputSamples(events, rendererEvents, clockCalibration.offsetMs);
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
      "dispatchToResponse",
      "rendererToPTYWrite",
    ]),
  },
  output: {
    sampleCount: outputSamples.length,
    stagesMs: summarizeStages(outputSamples, [
      "emissionToMain",
      "mainToRenderer",
      "mainToXtermWrite",
      "rendererToXtermWrite",
      "xtermWriteToPaint",
      "emissionToPaint",
    ]),
  },
  recordingDir: root,
  runId: manifest.terminalLatencyRunId ?? "",
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

function collectInputSamples(events, ipc, rendererEvents) {
  const samples = collectRendererInputSamples(rendererEvents);
  attachPreloadInputTimes(samples, ipc);
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

function attachPreloadInputTimes(samples, ipc) {
  for (const entry of ipc) {
    if (entry.type !== "ipc_start" || entry.channel !== "terminal:input") continue;
    const request = entry.args?.[0];
    const sample = samples.get(inputKey(request?.trace, request?.sessionId));
    if (sample) sample.preloadReceivedAt = request.trace.preloadReceivedAt;
  }
}

function attachMainInputTimes(samples, events) {
  for (const entry of events) {
    const payload = entry.payload;
    const sample = samples.get(inputKey(payload));
    if (!sample) continue;
    if (entry.type === "terminal_input_main_received")
      sample.mainReceivedAt = payload.mainReceivedAt;
    if (entry.type === "terminal_input_http_dispatched")
      sample.httpDispatchedAt = payload.httpDispatchedAt;
    if (entry.type === "terminal_input_http_response_received") {
      sample.handlerReceivedAt = payload.handlerReceivedAt;
      sample.ptyWriteCompletedAt = payload.ptyWriteCompletedAt;
      sample.responseReceivedAt = payload.receivedAt;
    }
  }
}

function toInputLatencySample(sample) {
  const times = parseTimes(sample, [
    "rendererReceivedAt",
    "preloadReceivedAt",
    "mainReceivedAt",
    "httpDispatchedAt",
    "handlerReceivedAt",
    "ptyWriteCompletedAt",
    "responseReceivedAt",
  ]);
  if (!times) return [];
  return [
    {
      clockOffsetEstimate:
        (times.handlerReceivedAt + times.ptyWriteCompletedAt) / 2 -
        (times.httpDispatchedAt + times.responseReceivedAt) / 2,
      dispatchToResponse: times.responseReceivedAt - times.httpDispatchedAt,
      handlerToPTYWrite: times.ptyWriteCompletedAt - times.handlerReceivedAt,
      mainToDispatch: times.httpDispatchedAt - times.mainReceivedAt,
      preloadToMain: times.mainReceivedAt - times.preloadReceivedAt,
      rendererToPreload: times.preloadReceivedAt - times.rendererReceivedAt,
      remoteHandlerReceivedAt: times.handlerReceivedAt,
      remotePTYWriteCompletedAt: times.ptyWriteCompletedAt,
      localHTTPDispatchedAt: times.httpDispatchedAt,
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
    const sample = samples.get(event.eventId);
    if (!sample) continue;
    if (event.type === "terminal_output_renderer_received") sample.rendererReceivedAt = event.at;
    if (event.type === "terminal_output_xterm_write") sample.xtermWriteAt = event.at;
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
      rendererToXtermWrite: times.xtermWriteAt - times.rendererReceivedAt,
      xtermWriteToPaint: times.paintedAt - times.xtermWriteAt,
    },
  ];
}

function calibrateRemoteClock(inputSamples) {
  const best = inputSamples.reduce(
    (current, sample) =>
      current === null || sample.dispatchToResponse < current.dispatchToResponse ? sample : current,
    null,
  );
  return {
    minimumRoundTripMs: best?.dispatchToResponse ?? null,
    offsetMs: best?.clockOffsetEstimate ?? 0,
    uncertaintyMs: best ? best.dispatchToResponse / 2 : null,
  };
}

function applyRemoteClockCalibration(inputSamples, remoteClockOffsetMs) {
  for (const sample of inputSamples) {
    sample.dispatchToHandler =
      sample.remoteHandlerReceivedAt - sample.localHTTPDispatchedAt - remoteClockOffsetMs;
    sample.rendererToPTYWrite =
      sample.remotePTYWriteCompletedAt - sample.localRendererReceivedAt - remoteClockOffsetMs;
  }
}

function inputKey(value, sessionId = value?.sessionId) {
  return `${value?.clientId ?? ""}:${sessionId ?? ""}:${value?.inputSequence ?? 0}`;
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
