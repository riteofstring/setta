"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  summarizeTrace,
} = require("./summarizeSectionTopLevelGridBenchmarkTrace");

function writeTraceFile(traceEvents) {
  const tracePath = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "setta-trace-")),
    "trace.json",
  );
  fs.writeFileSync(tracePath, JSON.stringify({ traceEvents }), "utf8");
  return tracePath;
}

test("summarizeTrace still handles legacy section-grid marks", () => {
  const tracePath = writeTraceFile([
    {
      cat: "blink.user_timing",
      name: "section-grid-horizontal-pan-start",
      ts: 1_000,
    },
    {
      cat: "devtools.timeline",
      name: "Paint",
      ts: 1_100,
      dur: 250,
    },
    {
      cat: "devtools.timeline",
      name: "Layout",
      ts: 1_400,
      dur: 50,
    },
    {
      cat: "blink.user_timing",
      name: "section-grid-horizontal-pan-end",
      ts: 2_000,
    },
  ]);

  const summary = summarizeTrace(tracePath);

  assert.equal(summary.markPrefix, "section-grid");
  assert.equal(summary.phases.horizontalPan.duration, 1);
  assert.equal(summary.phases.horizontalPan.Paint, 0.25);
  assert.equal(summary.phases.horizontalPan.Layout, 0.05);
});

test("summarizeTrace detects the new section-benchmark slow and fast phase names", () => {
  const tracePath = writeTraceFile([
    {
      cat: "blink.user_timing",
      name: "section-benchmark-overview-horizontal-pan-slow-start",
      ts: 10_000,
    },
    {
      cat: "devtools.timeline",
      name: "Paint",
      ts: 10_100,
      dur: 300,
    },
    {
      cat: "blink.user_timing",
      name: "section-benchmark-overview-horizontal-pan-slow-end",
      ts: 11_000,
    },
    {
      cat: "blink.user_timing",
      name: "section-benchmark-overview-to-detail-zoom-fast-start",
      ts: 12_000,
    },
    {
      cat: "devtools.timeline",
      name: "UpdateLayoutTree",
      ts: 12_050,
      dur: 125,
    },
    {
      cat: "blink.user_timing",
      name: "section-benchmark-overview-to-detail-zoom-fast-end",
      ts: 12_400,
    },
  ]);

  const summary = summarizeTrace(tracePath);

  assert.equal(summary.markPrefix, "section-benchmark");
  assert.equal(summary.phases.overviewHorizontalPanSlow.Paint, 0.3);
  assert.equal(summary.phases.overviewToDetailZoomFast.UpdateLayoutTree, 0.125);
  assert.equal(summary.phases.overviewToDetailZoomFast.duration, 0.4);
});
