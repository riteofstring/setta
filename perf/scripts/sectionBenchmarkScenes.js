"use strict";

const sceneManifest = require("../fixtures/section-benchmarks/scene-manifest.json");

const SECTION_BENCHMARK_SCENES = Object.freeze(
  Object.fromEntries(
    Object.entries(sceneManifest).map(([sceneId, scene]) => [
      sceneId,
      Object.freeze({
        ...scene,
        benchmarkConfig: scene.benchmarkConfig
          ? Object.freeze({ ...scene.benchmarkConfig })
          : undefined,
        notes: Array.isArray(scene.notes) ? Object.freeze([...scene.notes]) : [],
      }),
    ]),
  ),
);

function getSectionBenchmarkScene(sceneId) {
  const scene = SECTION_BENCHMARK_SCENES[sceneId];
  if (!scene) {
    const knownSceneIds = Object.keys(SECTION_BENCHMARK_SCENES).join(", ");
    throw new Error(
      `Unknown section benchmark scene '${sceneId}'. Known scene ids: ${knownSceneIds}.`,
    );
  }
  return scene;
}

function listSectionBenchmarkScenes() {
  return Object.values(SECTION_BENCHMARK_SCENES);
}

module.exports = {
  SECTION_BENCHMARK_SCENES,
  getSectionBenchmarkScene,
  listSectionBenchmarkScenes,
};
