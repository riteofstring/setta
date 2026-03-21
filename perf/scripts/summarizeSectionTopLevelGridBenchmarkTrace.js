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
    startSuffix: "benchmark-start",
    endSuffix: "benchmark-end",
  },
  {
    name: "horizontalPan",
    startSuffix: "horizontal-pan-start",
    endSuffix: "horizontal-pan-end",
  },
  {
    name: "verticalPan",
    startSuffix: "vertical-pan-start",
    endSuffix: "vertical-pan-end",
  },
  {
    name: "fullZoom",
    startSuffix: "full-zoom-start",
    endSuffix: "full-zoom-end",
  },
  {
    name: "detailZoom",
    startSuffix: "detail-zoom-start",
    endSuffix: "detail-zoom-end",
  },
  {
    name: "resize",
    startSuffix: "resize-start",
    endSuffix: "resize-end",
  },
  {
    name: "legacyPan",
    startSuffix: "pan-start",
    endSuffix: "pan-end",
  },
  {
    name: "legacyZoom",
    startSuffix: "zoom-start",
    endSuffix: "zoom-end",
  },
  {
    name: "overviewHorizontalPanSlow",
    startSuffix: "overview-horizontal-pan-slow-start",
    endSuffix: "overview-horizontal-pan-slow-end",
  },
  {
    name: "overviewHorizontalPanFast",
    startSuffix: "overview-horizontal-pan-fast-start",
    endSuffix: "overview-horizontal-pan-fast-end",
  },
  {
    name: "overviewVerticalPanSlow",
    startSuffix: "overview-vertical-pan-slow-start",
    endSuffix: "overview-vertical-pan-slow-end",
  },
  {
    name: "overviewVerticalPanFast",
    startSuffix: "overview-vertical-pan-fast-start",
    endSuffix: "overview-vertical-pan-fast-end",
  },
  {
    name: "closeHorizontalPanSlow",
    startSuffix: "close-horizontal-pan-slow-start",
    endSuffix: "close-horizontal-pan-slow-end",
  },
  {
    name: "closeHorizontalPanFast",
    startSuffix: "close-horizontal-pan-fast-start",
    endSuffix: "close-horizontal-pan-fast-end",
  },
  {
    name: "closeVerticalPanSlow",
    startSuffix: "close-vertical-pan-slow-start",
    endSuffix: "close-vertical-pan-slow-end",
  },
  {
    name: "closeVerticalPanFast",
    startSuffix: "close-vertical-pan-fast-start",
    endSuffix: "close-vertical-pan-fast-end",
  },
  {
    name: "overviewToDetailZoomSlow",
    startSuffix: "overview-to-detail-zoom-slow-start",
    endSuffix: "overview-to-detail-zoom-slow-end",
  },
  {
    name: "detailToOverviewZoomSlow",
    startSuffix: "detail-to-overview-zoom-slow-start",
    endSuffix: "detail-to-overview-zoom-slow-end",
  },
  {
    name: "overviewToDetailZoomFast",
    startSuffix: "overview-to-detail-zoom-fast-start",
    endSuffix: "overview-to-detail-zoom-fast-end",
  },
  {
    name: "detailToOverviewZoomFast",
    startSuffix: "detail-to-overview-zoom-fast-start",
    endSuffix: "detail-to-overview-zoom-fast-end",
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
        typeof event.name === "string",
      )
      .map((event) => [event.name, event.ts]),
  );
}

function collectMarkPrefixes(marks, preferredPrefix) {
  if (preferredPrefix) {
    return [preferredPrefix];
  }
  const prefixes = new Set();
  for (const phase of PHASE_DEFINITIONS) {
    const startSuffix = `-${phase.startSuffix}`;
    for (const markName of Object.keys(marks)) {
      if (markName.endsWith(startSuffix)) {
        prefixes.add(markName.slice(0, -startSuffix.length));
      }
    }
  }
  return Array.from(prefixes).sort();
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

function summarizeTrace(tracePath, options = {}) {
  const events = loadTraceEvents(tracePath);
  const marks = getMarks(events);
  const candidatePrefixes = collectMarkPrefixes(marks, options.markPrefix);
  const markPrefix =
    candidatePrefixes.length === 0
      ? null
      : candidatePrefixes
          .map((prefix) => ({
            prefix,
            phaseCount: PHASE_DEFINITIONS.filter((phase) => {
              const startTs = marks[`${prefix}-${phase.startSuffix}`];
              const endTs = marks[`${prefix}-${phase.endSuffix}`];
              return typeof startTs === "number" && typeof endTs === "number";
            }).length,
          }))
          .sort((left, right) => right.phaseCount - left.phaseCount)[0].prefix;
  const summary = {
    tracePath: path.resolve(tracePath),
    markPrefix,
    availableMarkPrefixes: candidatePrefixes,
    phases: {},
  };

  if (markPrefix === null) {
    return summary;
  }

  for (const phase of PHASE_DEFINITIONS) {
    const startMark = `${markPrefix}-${phase.startSuffix}`;
    const endMark = `${markPrefix}-${phase.endSuffix}`;
    const startTs = marks[startMark];
    const endTs = marks[endMark];
    if (typeof startTs !== "number" || typeof endTs !== "number") {
      continue;
    }
    const phaseSummary = {
      duration: Number(((endTs - startTs) / 1000).toFixed(3)),
      marks: {
        start: startMark,
        end: endMark,
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
  const markPrefix = process.argv[3];
  if (!tracePath) {
    console.error(
      "Usage: node perf/scripts/summarizeSectionTopLevelGridBenchmarkTrace.js <trace.json> [markPrefix]",
    );
    process.exit(1);
  }

  const summary = summarizeTrace(tracePath, { markPrefix });
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

if (require.main === module) {
  main();
}

module.exports = {
  summarizeTrace,
};
