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
  assert.equal(scene.storageKind, "settings_project");
  assert.equal(
    scene.fixturePath,
    "perf/fixtures/section-benchmarks/settings.settings-project.json",
  );
  assert.equal(scene.benchmarkConfig.markPrefix, "section-grid");
  assert.equal(scene.benchmarkConfig.includeResizePhase, true);
});

test("tier1 synthetic scene is ready and keeps the generic benchmark config", () => {
  const scene = getSectionBenchmarkScene("tier1Synthetic");

  assert.equal(scene.availability, "ready");
  assert.equal(scene.routePath, "/benchmark-tier1");
  assert.equal(scene.storageKind, "main_project_config");
  assert.equal(
    scene.fixturePath,
    "perf/fixtures/section-benchmarks/tier1-synthetic.project.json",
  );
  assert.equal(scene.benchmarkConfig.markPrefix, "section-benchmark");
  assert.equal(scene.benchmarkConfig.targetSectionPattern, "callable_00");
  assert.equal(scene.benchmarkConfig.includeResizePhase, false);
});

test("scene inventory remains stable while later synthetic scenes stay planned", () => {
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
  assert.equal(getSectionBenchmarkScene("tier2Synthetic").availability, "planned");
});

test("unknown scene ids fail loudly", () => {
  assert.throws(
    () => getSectionBenchmarkScene("missing-scene"),
    /Unknown section benchmark scene/,
  );
});
