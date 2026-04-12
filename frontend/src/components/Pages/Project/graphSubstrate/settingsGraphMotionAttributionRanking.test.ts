import { describe, expect, it } from "vitest";
import {
  resolveDominantMotionAttributionOwner,
  resolveTopMotionAttributionOwners,
} from "./settingsGraphMotionAttributionRanking";
import {
  createEmptySettingsGraphSubstrateCanaryInstrumentationSnapshot,
  type SettingsGraphSubstrateCanaryMotionAttribution,
} from "./settingsGraphSubstrateCanaryInstrumentation";

function createMotionAttribution(): SettingsGraphSubstrateCanaryMotionAttribution {
  return createEmptySettingsGraphSubstrateCanaryInstrumentationSnapshot()
    .motionAttribution;
}

describe("settingsGraphMotionAttributionRanking", () => {
  it("returns the highest-total owners in descending order", () => {
    const motionAttribution = createMotionAttribution();
    motionAttribution.presentedSceneSectionSubtreeReactRender = {
      count: 3,
      maxDurationMs: 40,
      totalDurationMs: 120,
    };
    motionAttribution.presentedSceneSectionBodySubtreeReactRender = {
      count: 2,
      maxDurationMs: 55,
      totalDurationMs: 120,
    };
    motionAttribution.presentedSceneSectionParamDndListRowsReactRender = {
      count: 4,
      maxDurationMs: 18,
      totalDurationMs: 60,
    };

    expect(resolveDominantMotionAttributionOwner(motionAttribution)).toBe(
      "presentedSceneSectionBodySubtreeReactRender",
    );
    expect(resolveTopMotionAttributionOwners(motionAttribution, 2)).toEqual([
      {
        count: 2,
        maxDurationMs: 55,
        owner: "presentedSceneSectionBodySubtreeReactRender",
        totalDurationMs: 120,
      },
      {
        count: 3,
        maxDurationMs: 40,
        owner: "presentedSceneSectionSubtreeReactRender",
        totalDurationMs: 120,
      },
    ]);
  });

  it("omits zero-total owners and respects a non-positive limit", () => {
    const motionAttribution = createMotionAttribution();
    motionAttribution.presentedSceneSectionParamInputReactRender = {
      count: 5,
      maxDurationMs: 7,
      totalDurationMs: 20,
    };

    expect(resolveTopMotionAttributionOwners(motionAttribution, 0)).toEqual([]);
    expect(resolveTopMotionAttributionOwners(motionAttribution, -1)).toEqual(
      [],
    );
    expect(resolveTopMotionAttributionOwners(motionAttribution, 5)).toEqual([
      {
        count: 5,
        maxDurationMs: 7,
        owner: "presentedSceneSectionParamInputReactRender",
        totalDurationMs: 20,
      },
    ]);
  });
});
