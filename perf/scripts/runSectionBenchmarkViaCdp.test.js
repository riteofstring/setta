"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildBenchmarkConfig,
  getHelpText,
  parseArgs,
  prepareSceneUi,
} = require("./runSectionBenchmarkViaCdp");

test("parseArgs keeps summary path optional", () => {
  const options = parseArgs([
    "--browser-url",
    "http://127.0.0.1:9233",
    "--page-url",
    "http://127.0.0.1:3011/settings",
    "--scene-id",
    "settings",
    "--trace-path",
    "perf/tmp/settings-trace.json",
    "--benchmark-result-path",
    "perf/tmp/settings-result.json",
  ]);

  assert.equal(options.browserUrl, "http://127.0.0.1:9233");
  assert.equal(options.pageUrl, "http://127.0.0.1:3011/settings");
  assert.equal(options.sceneId, "settings");
  assert.equal(options.summaryPath, null);
});

test("parseArgs accepts help mode without other arguments", () => {
  const options = parseArgs(["--help"]);

  assert.equal(options.help, true);
  assert.equal(options.browserUrl, null);
});

test("buildBenchmarkConfig merges the scene id into the replay config", () => {
  const { scene, benchmarkConfig } = buildBenchmarkConfig("settings");

  assert.equal(scene.id, "settings");
  assert.deepEqual(scene.preBenchmarkUi, {
    clickViewModeLabel: "All Settings",
    waitForText: "groupSectionDefault",
  });
  assert.equal(benchmarkConfig.sceneId, "settings");
  assert.equal(benchmarkConfig.targetSectionPattern, "groupSectionDefault");
  assert.equal(benchmarkConfig.includeResizePhase, true);
});

test("buildBenchmarkConfig keeps synthetic scene replay config unchanged", () => {
  const { scene, benchmarkConfig } = buildBenchmarkConfig("tier1Synthetic");

  assert.equal(scene.id, "tier1Synthetic");
  assert.equal(benchmarkConfig.sceneId, "tier1Synthetic");
  assert.equal(benchmarkConfig.targetSectionPattern, "callable_00");
  assert.equal(benchmarkConfig.includeResizePhase, false);
});

test("prepareSceneUi is a no-op for scenes without pre-benchmark UI", async () => {
  const page = {};

  await assert.doesNotReject(
    prepareSceneUi(page, {
      id: "tier1Synthetic",
    }),
  );
});

test("help text documents the optional summary path", () => {
  const helpText = getHelpText();

  assert.match(helpText, /runSectionBenchmarkViaCdp\.js/);
  assert.match(helpText, /--summary-path/);
});
