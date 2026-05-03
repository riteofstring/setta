import { resolveEdgeStripHeight } from "components/Params/edgeStripUtils";
import {
  getEdgesStripHeightKey,
  getKwargsControlsHeightKey,
  getParamsFixedHeightKey,
  getPinnedParamsAreaHeightKey,
  getSectionHeaderHeightKey,
  getSectionSearchHeightKey,
} from "utils/constants";
import { describe, expect, it } from "vitest";
import { getProjectGpuParamContentMetrics } from "./projectGpuParamContentLayout";

describe("project GPU param content layout", () => {
  it("derives edge-strip spacing from scene metadata instead of measured height state", () => {
    const sectionId = "section-a";

    const metrics = getProjectGpuParamContentMetrics({
      edgeInputPortCount: 2,
      edgeOutputPortCount: 1,
      measuredHeightsByKey: {
        [getEdgesStripHeightKey(sectionId)]: 999,
        [getKwargsControlsHeightKey(sectionId)]: 13,
        [getParamsFixedHeightKey(sectionId)]: 19,
        [getPinnedParamsAreaHeightKey(sectionId)]: 17,
        [getSectionHeaderHeightKey(sectionId)]: 7,
        [getSectionSearchHeightKey(sectionId)]: 11,
      },
      sectionId,
    });

    expect(metrics.edgesHeight).toBe(
      resolveEdgeStripHeight({
        inputPortCount: 2,
        outputPortCount: 1,
      }),
    );
    expect(metrics.contentTop).toBe(7 + 11 + 13 + 5);
    expect(metrics.paramsFixedHeight).toBe(19);
    expect(metrics.pinnedHeight).toBe(17);
  });
});
