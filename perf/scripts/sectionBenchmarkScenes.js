"use strict";

const SECTION_BENCHMARK_SCENES = Object.freeze({
  settings: Object.freeze({
    id: "settings",
    availability: "ready",
    category: "real-project",
    routePath: "/settings",
    description:
      "Mandatory dense real-project baseline used for the hybrid rendering work.",
    targetSectionPattern: "groupSectionDefault",
    benchmarkConfig: Object.freeze({
      markPrefix: "section-grid",
      targetSectionPattern: "groupSectionDefault",
      includeResizePhase: true,
    }),
    notes: Object.freeze([
      "Current authoritative scene is the existing settings project surface.",
      "Move this scene behind a checked-in fixture loader before relying on it as the only canonical seed path.",
    ]),
  }),
  tier1Synthetic: Object.freeze({
    id: "tier1Synthetic",
    availability: "planned",
    category: "synthetic",
    fixturePath: "perf/fixtures/section-benchmarks/tier1-synthetic.project.json",
    description:
      "Deterministic synthetic canvas covering the repeated Tier 1 dense param section families.",
    notes: Object.freeze([
      "Should include representative repeated counts for Callable, Dict, param-heavy dict variants, list/object-style param sections, and GlobalVariables when it shares the same body stack.",
    ]),
  }),
  tier2Synthetic: Object.freeze({
    id: "tier2Synthetic",
    availability: "planned",
    category: "synthetic",
    fixturePath: "perf/fixtures/section-benchmarks/tier2-synthetic.project.json",
    description:
      "Deterministic synthetic canvas covering Tier 2 code/editor section families.",
    notes: Object.freeze([
      "Prompt and TextBlock belong here only for their editor-side CodeMirror path, not for their restored outer layout shell.",
    ]),
  }),
  tier1Tier2CombinedSynthetic: Object.freeze({
    id: "tier1Tier2CombinedSynthetic",
    availability: "planned",
    category: "synthetic",
    fixturePath:
      "perf/fixtures/section-benchmarks/tier1-tier2-combined.project.json",
    description:
      "Deterministic mixed canvas used once both heavy families have dedicated scenes.",
    notes: Object.freeze([
      "Should preserve deterministic section IDs, positions, and sizes so the same CDP replay remains valid across main and worktree runs.",
    ]),
  }),
});

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
