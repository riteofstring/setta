"use strict";

const {
  SECTION_PAN_ZOOM_BENCHMARK_REPLAY,
  sectionPanZoomBenchmarkReplay,
} = require("./sectionPanZoomBenchmarkReplay");

function settingsTopLevelGridBenchmarkReplay(rawConfig = {}) {
  return sectionPanZoomBenchmarkReplay({
    sceneId: "settings",
    markPrefix: "section-grid",
    targetSectionPattern: "groupSectionDefault",
    includeResizePhase: true,
    ...rawConfig,
  });
}

const SETTINGS_TOP_LEVEL_GRID_BENCHMARK_REPLAY = `function settingsTopLevelGridBenchmarkReplay(rawConfig = {}) {
  return (${SECTION_PAN_ZOOM_BENCHMARK_REPLAY})({
    sceneId: "settings",
    markPrefix: "section-grid",
    targetSectionPattern: "groupSectionDefault",
    includeResizePhase: true,
    ...rawConfig,
  });
}`;

module.exports = {
  settingsTopLevelGridBenchmarkReplay,
  SETTINGS_TOP_LEVEL_GRID_BENCHMARK_REPLAY,
};

if (require.main === module) {
  process.stdout.write(SETTINGS_TOP_LEVEL_GRID_BENCHMARK_REPLAY);
}
