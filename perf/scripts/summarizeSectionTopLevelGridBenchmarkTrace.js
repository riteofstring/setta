"use strict";

const fs = require("node:fs");
const path = require("node:path");

const METRICS = [
  "FunctionCall",
  "UpdateLayoutTree",
  "Layout",
  "Paint",
  "RunTask",
  "EventDispatch",
  "TimerFire",
  "FireAnimationFrame",
  "Commit",
];

const PHASE_DEFINITIONS = [
  {
    name: "benchmark",
    start: "section-grid-benchmark-start",
    end: "section-grid-benchmark-end",
  },
  {
    name: "horizontalPan",
    start: "section-grid-horizontal-pan-start",
    end: "section-grid-horizontal-pan-end",
  },
  {
    name: "verticalPan",
    start: "section-grid-vertical-pan-start",
    end: "section-grid-vertical-pan-end",
  },
  {
    name: "fullZoom",
    start: "section-grid-full-zoom-start",
    end: "section-grid-full-zoom-end",
  },
  {
    name: "detailZoom",
    start: "section-grid-detail-zoom-start",
    end: "section-grid-detail-zoom-end",
  },
  {
    name: "resize",
    start: "section-grid-resize-start",
    end: "section-grid-resize-end",
  },
  {
    name: "legacyPan",
    start: "section-grid-pan-start",
    end: "section-grid-pan-end",
  },
  {
    name: "legacyZoom",
    start: "section-grid-zoom-start",
    end: "section-grid-zoom-end",
  },
];

function loadTraceEvents(tracePath) {
  const raw = fs.readFileSync(tracePath, "utf8");
  const payload = JSON.parse(raw);
  return payload.traceEvents || [];
}

function getMarks(events) {
  return Object.fromEntries(
    events
      .filter(
        (event) =>
          event.cat &&
          String(event.cat).includes("blink.user_timing") &&
          typeof event.name === "string" &&
          event.name.startsWith("section-grid-"),
      )
      .map((event) => [event.name, event.ts]),
  );
}

function sumMetric(events, name, startTs, endTs) {
  return (
    events
      .filter(
        (event) =>
          event.name === name &&
          typeof event.ts === "number" &&
          typeof event.dur === "number" &&
          event.ts >= startTs &&
          event.ts + event.dur <= endTs,
      )
      .reduce((sum, event) => sum + event.dur, 0) / 1000
  );
}

function summarizeTrace(tracePath) {
  const events = loadTraceEvents(tracePath);
  const marks = getMarks(events);
  const summary = {
    tracePath: path.resolve(tracePath),
    phases: {},
  };

  for (const phase of PHASE_DEFINITIONS) {
    const startTs = marks[phase.start];
    const endTs = marks[phase.end];
    if (typeof startTs !== "number" || typeof endTs !== "number") {
      continue;
    }
    const phaseSummary = {
      duration: Number(((endTs - startTs) / 1000).toFixed(3)),
      marks: {
        start: phase.start,
        end: phase.end,
      },
    };
    for (const metric of METRICS) {
      phaseSummary[metric] = Number(
        sumMetric(events, metric, startTs, endTs).toFixed(3),
      );
    }
    summary.phases[phase.name] = phaseSummary;
  }

  return summary;
}

function main() {
  const tracePath = process.argv[2];
  if (!tracePath) {
    console.error(
      "Usage: node perf/scripts/summarizeSectionTopLevelGridBenchmarkTrace.js <trace.json>",
    );
    process.exit(1);
  }

  const summary = summarizeTrace(tracePath);
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

if (require.main === module) {
  main();
}

module.exports = {
  summarizeTrace,
};
