/* @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createEmptySettingsGraphSubstrateCanaryInstrumentationSnapshot,
  measureSettingsGraphSubstrateCanaryMotionAttribution,
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
      motionAttribution:
        createEmptySettingsGraphSubstrateCanaryInstrumentationSnapshot()
          .motionAttribution,
      motionAttributionActive: false,
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

  it("records motion attribution only while attribution capture is active", () => {
    measureSettingsGraphSubstrateCanaryMotionAttribution(
      "reactFlowViewportPublish",
      () => {},
    );

    updateSettingsGraphSubstrateCanaryInstrumentationSnapshot({
      motionAttributionActive: true,
    });

    const performanceNowSpy = vi
      .spyOn(globalThis.performance, "now")
      .mockReturnValueOnce(12)
      .mockReturnValueOnce(15.5);

    measureSettingsGraphSubstrateCanaryMotionAttribution(
      "reactFlowViewportPublish",
      () => {},
    );

    performanceNowSpy.mockRestore();

    expect(
      readSettingsGraphSubstrateCanaryInstrumentationSnapshot()
        .motionAttribution.reactFlowViewportPublish,
    ).toEqual({
      count: 1,
      maxDurationMs: 3.5,
      totalDurationMs: 3.5,
    });
  });

  it("tracks newly added motion attribution owners in the shared snapshot", () => {
    updateSettingsGraphSubstrateCanaryInstrumentationSnapshot({
      motionAttributionActive: true,
    });

    const performanceNowSpy = vi
      .spyOn(globalThis.performance, "now")
      .mockReturnValueOnce(20)
      .mockReturnValueOnce(21)
      .mockReturnValueOnce(30)
      .mockReturnValueOnce(32.5);

    measureSettingsGraphSubstrateCanaryMotionAttribution(
      "presentedSceneBodyMountFilter",
      () => {},
    );
    measureSettingsGraphSubstrateCanaryMotionAttribution(
      "pixiDrawableModelResolve",
      () => {},
    );

    performanceNowSpy.mockRestore();

    const motionAttribution =
      readSettingsGraphSubstrateCanaryInstrumentationSnapshot()
        .motionAttribution;
    expect(motionAttribution.presentedSceneBodyMountFilter).toEqual({
      count: 1,
      maxDurationMs: 1,
      totalDurationMs: 1,
    });
    expect(motionAttribution.pixiDrawableModelResolve).toEqual({
      count: 1,
      maxDurationMs: 2.5,
      totalDurationMs: 2.5,
    });
  });
});
