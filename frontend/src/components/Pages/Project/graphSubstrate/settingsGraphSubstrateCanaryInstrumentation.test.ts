/* @vitest-environment jsdom */

import { afterEach, describe, expect, it } from "vitest";
import {
  createEmptySettingsGraphSubstrateCanaryInstrumentationSnapshot,
  readSettingsGraphSubstrateCanaryInstrumentationSnapshot,
  resetSettingsGraphSubstrateCanaryInstrumentationSnapshot,
  updateSettingsGraphSubstrateCanaryInstrumentationSnapshot,
} from "./settingsGraphSubstrateCanaryInstrumentation";

describe("settingsGraphSubstrateCanaryInstrumentation", () => {
  afterEach(() => {
    resetSettingsGraphSubstrateCanaryInstrumentationSnapshot();
  });

  it("returns the empty instrumentation snapshot by default", () => {
    expect(readSettingsGraphSubstrateCanaryInstrumentationSnapshot()).toEqual(
      createEmptySettingsGraphSubstrateCanaryInstrumentationSnapshot(),
    );
  });

  it("merges partial updates into the current instrumentation snapshot", () => {
    updateSettingsGraphSubstrateCanaryInstrumentationSnapshot({
      mounted: true,
      mountedSceneSectionCount: 6,
      viewportZoom: 0.24,
    });
    updateSettingsGraphSubstrateCanaryInstrumentationSnapshot({
      pixiDrawableCount: 18,
      visibleViewportSize: { width: 1200, height: 720 },
    });

    expect(readSettingsGraphSubstrateCanaryInstrumentationSnapshot()).toEqual({
      mounted: true,
      mountedSceneSectionCount: 6,
      mountedSectionBodyCount: 0,
      pixiDrawableCount: 18,
      pixiSyncCount: 0,
      sceneSyncCount: 0,
      unresolvedSectionSeedFallbackCount: 0,
      viewportZoom: 0.24,
      visibleViewportSize: { width: 1200, height: 720 },
    });
  });

  it("resets the instrumentation snapshot back to the empty state", () => {
    updateSettingsGraphSubstrateCanaryInstrumentationSnapshot({
      mounted: true,
      mountedSectionBodyCount: 4,
      pixiSyncCount: 9,
    });

    resetSettingsGraphSubstrateCanaryInstrumentationSnapshot();

    expect(readSettingsGraphSubstrateCanaryInstrumentationSnapshot()).toEqual(
      createEmptySettingsGraphSubstrateCanaryInstrumentationSnapshot(),
    );
  });
});
