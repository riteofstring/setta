import { describe, expect, it } from "vitest";
import {
  resolveDominantMotionAttributionOwner,
  resolveTopMotionAttributionOwners,
  resolveTopMotionAttributionOwnersExcluding,
  SETTINGS_GRAPH_SUBSTRATE_CANARY_CUMULATIVE_SECTION_RENDER_OWNERS,
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
    motionAttribution.presentedSceneSectionUnpinnedParamDndListRowsReactRender =
      {
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

  it("can exclude cumulative section owners to surface narrower descendants", () => {
    const motionAttribution = createMotionAttribution();
    motionAttribution.presentedSceneSectionSubtreeReactRender = {
      count: 3,
      maxDurationMs: 40,
      totalDurationMs: 120,
    };
    motionAttribution.presentedSceneSectionBodyContentReactRender = {
      count: 4,
      maxDurationMs: 28,
      totalDurationMs: 90,
    };
    motionAttribution.presentedSceneSectionParamGroupContainerReactRender = {
      count: 6,
      maxDurationMs: 20,
      totalDurationMs: 72,
    };
    motionAttribution.presentedSceneSectionUnpinnedParamDndListRowsReactRender =
      {
        count: 8,
        maxDurationMs: 12,
        totalDurationMs: 61,
      };

    expect(
      resolveTopMotionAttributionOwnersExcluding(
        motionAttribution,
        SETTINGS_GRAPH_SUBSTRATE_CANARY_CUMULATIVE_SECTION_RENDER_OWNERS,
        3,
      ),
    ).toEqual([
      {
        count: 6,
        maxDurationMs: 20,
        owner: "presentedSceneSectionParamGroupContainerReactRender",
        totalDurationMs: 72,
      },
      {
        count: 8,
        maxDurationMs: 12,
        owner: "presentedSceneSectionUnpinnedParamDndListRowsReactRender",
        totalDurationMs: 61,
      },
    ]);
  });
});
