"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getSectionBenchmarkScene,
  listSectionBenchmarkScenes,
} = require("./sectionBenchmarkScenes");

test("settings scene is ready and keeps the compatibility benchmark config", () => {
  const scene = getSectionBenchmarkScene("settings");

  assert.equal(scene.availability, "ready");
  assert.equal(scene.routePath, "/settings");
  assert.equal(scene.benchmarkConfig.markPrefix, "section-grid");
  assert.equal(scene.benchmarkConfig.includeResizePhase, true);
});

test("planned synthetic scenes remain enumerable with deterministic fixture targets", () => {
  const scenes = listSectionBenchmarkScenes();

  assert.deepEqual(
    scenes.map((scene) => scene.id),
    [
      "settings",
      "tier1Synthetic",
      "tier2Synthetic",
      "tier1Tier2CombinedSynthetic",
    ],
  );
  assert.equal(
    getSectionBenchmarkScene("tier1Tier2CombinedSynthetic").fixturePath,
    "perf/fixtures/section-benchmarks/tier1-tier2-combined.project.json",
  );
});

test("unknown scene ids fail loudly", () => {
  assert.throws(
    () => getSectionBenchmarkScene("missing-scene"),
    /Unknown section benchmark scene/,
  );
});
