/* @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createEmptySettingsGraphSubstrateCanaryInstrumentationSnapshot,
  measureSettingsGraphSubstrateCanaryMotionAttribution,
  readSettingsGraphSubstrateCanaryInstrumentationSnapshot,
  recordSettingsGraphSubstrateCanaryMotionAttributionDuration,
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

  it("records direct motion attribution durations for profiler-driven owners", () => {
    recordSettingsGraphSubstrateCanaryMotionAttributionDuration(
      "presentedSceneSectionSubtreeReactRender",
      9,
    );

    updateSettingsGraphSubstrateCanaryInstrumentationSnapshot({
      motionAttributionActive: true,
    });

    recordSettingsGraphSubstrateCanaryMotionAttributionDuration(
      "presentedSceneSectionSubtreeReactRender",
      4.5,
    );
    recordSettingsGraphSubstrateCanaryMotionAttributionDuration(
      "presentedSceneSectionSubtreeReactRender",
      7.25,
    );

    expect(
      readSettingsGraphSubstrateCanaryInstrumentationSnapshot()
        .motionAttribution.presentedSceneSectionSubtreeReactRender,
    ).toEqual({
      count: 2,
      maxDurationMs: 7.25,
      totalDurationMs: 11.75,
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
      .mockReturnValueOnce(32.5)
      .mockReturnValueOnce(40)
      .mockReturnValueOnce(44)
      .mockReturnValueOnce(50)
      .mockReturnValueOnce(51.25)
      .mockReturnValueOnce(60)
      .mockReturnValueOnce(63.75)
      .mockReturnValueOnce(70)
      .mockReturnValueOnce(75)
      .mockReturnValueOnce(80)
      .mockReturnValueOnce(82)
      .mockReturnValueOnce(90)
      .mockReturnValueOnce(93.5);

    measureSettingsGraphSubstrateCanaryMotionAttribution(
      "presentedSceneBodyMountFilter",
      () => {},
    );
    measureSettingsGraphSubstrateCanaryMotionAttribution(
      "presentedSceneSectionArrayReuseCheck",
      () => {},
    );
    measureSettingsGraphSubstrateCanaryMotionAttribution(
      "mountedSectionBodyIdSetReuseCheck",
      () => {},
    );
    measureSettingsGraphSubstrateCanaryMotionAttribution(
      "presentedSceneSectionEntriesResolve",
      () => {},
    );
    recordSettingsGraphSubstrateCanaryMotionAttributionDuration(
      "presentedSceneSectionCodeAreaReactRender",
      3.25,
    );
    recordSettingsGraphSubstrateCanaryMotionAttributionDuration(
      "presentedSceneSectionContainerReactRender",
      1.25,
    );
    recordSettingsGraphSubstrateCanaryMotionAttributionDuration(
      "presentedSceneSectionCoreShellLayerReactRender",
      2.75,
    );
    recordSettingsGraphSubstrateCanaryMotionAttributionDuration(
      "presentedSceneSectionSubtreeReactRender",
      2.25,
    );
    recordSettingsGraphSubstrateCanaryMotionAttributionDuration(
      "presentedSceneSectionBodySubtreeReactRender",
      6.5,
    );
    recordSettingsGraphSubstrateCanaryMotionAttributionDuration(
      "presentedSceneSectionEntryBodyGateReactRender",
      5.25,
    );
    recordSettingsGraphSubstrateCanaryMotionAttributionDuration(
      "presentedSceneSectionEntryImperativeFlush",
      4.5,
    );
    recordSettingsGraphSubstrateCanaryMotionAttributionDuration(
      "presentedSceneSectionEntryShellReactRender",
      2.5,
    );
    recordSettingsGraphSubstrateCanaryMotionAttributionDuration(
      "presentedSceneSectionHeaderReactRender",
      1.75,
    );
    recordSettingsGraphSubstrateCanaryMotionAttributionDuration(
      "presentedSceneSectionBodyContentReactRender",
      4.25,
    );
    recordSettingsGraphSubstrateCanaryMotionAttributionDuration(
      "presentedSceneSectionCanvasSectionBodyReactRender",
      2,
    );
    recordSettingsGraphSubstrateCanaryMotionAttributionDuration(
      "presentedSceneSectionAreaSwitchReactRender",
      3.5,
    );
    recordSettingsGraphSubstrateCanaryMotionAttributionDuration(
      "presentedSceneSectionKwargsControlsReactRender",
      1.5,
    );
    recordSettingsGraphSubstrateCanaryMotionAttributionDuration(
      "presentedSceneSectionParamGroupEdgesStripReactRender",
      2.25,
    );
    recordSettingsGraphSubstrateCanaryMotionAttributionDuration(
      "presentedSceneSectionParamGroupPinnedParamsReactRender",
      1.75,
    );
    recordSettingsGraphSubstrateCanaryMotionAttributionDuration(
      "presentedSceneSectionParamGroupContainerReactRender",
      2.75,
    );
    recordSettingsGraphSubstrateCanaryMotionAttributionDuration(
      "presentedSceneSectionPinnedParamDndListRowsReactRender",
      2.5,
    );
    recordSettingsGraphSubstrateCanaryMotionAttributionDuration(
      "presentedSceneSectionUnpinnedParamDndListRowsReactRender",
      2.75,
    );
    recordSettingsGraphSubstrateCanaryMotionAttributionDuration(
      "presentedSceneSectionParamInputReactRender",
      1.5,
    );
    recordSettingsGraphSubstrateCanaryMotionAttributionDuration(
      "presentedSceneSectionParamNameInputReactRender",
      1.75,
    );
    recordSettingsGraphSubstrateCanaryMotionAttributionDuration(
      "presentedSceneSectionParamTextLabelReactRender",
      2.25,
    );
    recordSettingsGraphSubstrateCanaryMotionAttributionDuration(
      "presentedSceneSectionParamGroupUnpinnedParamsReactRender",
      3,
    );
    recordSettingsGraphSubstrateCanaryMotionAttributionDuration(
      "presentedSceneSectionParamGroupUnpinnedAreaReactRender",
      2.5,
    );
    measureSettingsGraphSubstrateCanaryMotionAttribution(
      "presentedSceneSectionParamDndListDuplicateIndexResolve",
      () => {},
    );
    measureSettingsGraphSubstrateCanaryMotionAttribution(
      "presentedSceneSectionParamDndListTreeResolve",
      () => {},
    );
    measureSettingsGraphSubstrateCanaryMotionAttribution(
      "pixiDrawableReuseCheck",
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
    expect(motionAttribution.presentedSceneSectionArrayReuseCheck).toEqual({
      count: 1,
      maxDurationMs: 2.5,
      totalDurationMs: 2.5,
    });
    expect(motionAttribution.mountedSectionBodyIdSetReuseCheck).toEqual({
      count: 1,
      maxDurationMs: 4,
      totalDurationMs: 4,
    });
    expect(motionAttribution.presentedSceneSectionEntriesResolve).toEqual({
      count: 1,
      maxDurationMs: 1.25,
      totalDurationMs: 1.25,
    });
    expect(motionAttribution.presentedSceneSectionSubtreeReactRender).toEqual({
      count: 1,
      maxDurationMs: 2.25,
      totalDurationMs: 2.25,
    });
    expect(motionAttribution.presentedSceneSectionContainerReactRender).toEqual(
      {
        count: 1,
        maxDurationMs: 1.25,
        totalDurationMs: 1.25,
      },
    );
    expect(
      motionAttribution.presentedSceneSectionCoreShellLayerReactRender,
    ).toEqual({
      count: 1,
      maxDurationMs: 2.75,
      totalDurationMs: 2.75,
    });
    expect(motionAttribution.presentedSceneSectionCodeAreaReactRender).toEqual({
      count: 1,
      maxDurationMs: 3.25,
      totalDurationMs: 3.25,
    });
    expect(
      motionAttribution.presentedSceneSectionBodySubtreeReactRender,
    ).toEqual({
      count: 1,
      maxDurationMs: 6.5,
      totalDurationMs: 6.5,
    });
    expect(
      motionAttribution.presentedSceneSectionEntryBodyGateReactRender,
    ).toEqual({
      count: 1,
      maxDurationMs: 5.25,
      totalDurationMs: 5.25,
    });
    expect(motionAttribution.presentedSceneSectionEntryImperativeFlush).toEqual(
      {
        count: 1,
        maxDurationMs: 4.5,
        totalDurationMs: 4.5,
      },
    );
    expect(
      motionAttribution.presentedSceneSectionEntryShellReactRender,
    ).toEqual({
      count: 1,
      maxDurationMs: 2.5,
      totalDurationMs: 2.5,
    });
    expect(motionAttribution.presentedSceneSectionHeaderReactRender).toEqual({
      count: 1,
      maxDurationMs: 1.75,
      totalDurationMs: 1.75,
    });
    expect(
      motionAttribution.presentedSceneSectionBodyContentReactRender,
    ).toEqual({
      count: 1,
      maxDurationMs: 4.25,
      totalDurationMs: 4.25,
    });
    expect(
      motionAttribution.presentedSceneSectionCanvasSectionBodyReactRender,
    ).toEqual({
      count: 1,
      maxDurationMs: 2,
      totalDurationMs: 2,
    });
    expect(
      motionAttribution.presentedSceneSectionAreaSwitchReactRender,
    ).toEqual({
      count: 1,
      maxDurationMs: 3.5,
      totalDurationMs: 3.5,
    });
    expect(
      motionAttribution.presentedSceneSectionKwargsControlsReactRender,
    ).toEqual({
      count: 1,
      maxDurationMs: 1.5,
      totalDurationMs: 1.5,
    });
    expect(
      motionAttribution.presentedSceneSectionParamGroupContainerReactRender,
    ).toEqual({
      count: 1,
      maxDurationMs: 2.75,
      totalDurationMs: 2.75,
    });
    expect(
      motionAttribution.presentedSceneSectionParamGroupEdgesStripReactRender,
    ).toEqual({
      count: 1,
      maxDurationMs: 2.25,
      totalDurationMs: 2.25,
    });
    expect(
      motionAttribution.presentedSceneSectionParamGroupPinnedParamsReactRender,
    ).toEqual({
      count: 1,
      maxDurationMs: 1.75,
      totalDurationMs: 1.75,
    });
    expect(
      motionAttribution.presentedSceneSectionPinnedParamDndListRowsReactRender,
    ).toEqual({
      count: 1,
      maxDurationMs: 2.5,
      totalDurationMs: 2.5,
    });
    expect(
      motionAttribution.presentedSceneSectionUnpinnedParamDndListRowsReactRender,
    ).toEqual({
      count: 1,
      maxDurationMs: 2.75,
      totalDurationMs: 2.75,
    });
    expect(
      motionAttribution.presentedSceneSectionParamInputReactRender,
    ).toEqual({
      count: 1,
      maxDurationMs: 1.5,
      totalDurationMs: 1.5,
    });
    expect(
      motionAttribution.presentedSceneSectionParamNameInputReactRender,
    ).toEqual({
      count: 1,
      maxDurationMs: 1.75,
      totalDurationMs: 1.75,
    });
    expect(
      motionAttribution.presentedSceneSectionParamTextLabelReactRender,
    ).toEqual({
      count: 1,
      maxDurationMs: 2.25,
      totalDurationMs: 2.25,
    });
    expect(
      motionAttribution.presentedSceneSectionParamDndListDuplicateIndexResolve,
    ).toEqual({
      count: 1,
      maxDurationMs: 3.75,
      totalDurationMs: 3.75,
    });
    expect(
      motionAttribution.presentedSceneSectionParamDndListTreeResolve,
    ).toEqual({
      count: 1,
      maxDurationMs: 5,
      totalDurationMs: 5,
    });
    expect(
      motionAttribution.presentedSceneSectionParamGroupUnpinnedParamsReactRender,
    ).toEqual({
      count: 1,
      maxDurationMs: 3,
      totalDurationMs: 3,
    });
    expect(
      motionAttribution.presentedSceneSectionParamGroupUnpinnedAreaReactRender,
    ).toEqual({
      count: 1,
      maxDurationMs: 2.5,
      totalDurationMs: 2.5,
    });
    expect(motionAttribution.pixiDrawableReuseCheck).toEqual({
      count: 1,
      maxDurationMs: 2,
      totalDurationMs: 2,
    });
    expect(motionAttribution.pixiDrawableModelResolve).toEqual({
      count: 1,
      maxDurationMs: 3.5,
      totalDurationMs: 3.5,
    });
  });
});
