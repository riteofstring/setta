import { resolveEdgeStripHeight } from "components/Params/edgeStripUtils";
import { getKwargsControlsHeightKey } from "utils/constants";
import { describe, expect, it } from "vitest";
import {
  getProjectGpuParamContentMetrics,
  getProjectGpuParamListSurfaceHeight,
} from "./projectGpuParamContentLayout";

describe("project GPU param content layout", () => {
  it("derives edge-strip spacing from scene metadata instead of measured height state", () => {
    const sectionId = "section-a";

    const metrics = getProjectGpuParamContentMetrics({
      edgeInputPortCount: 2,
      edgeOutputPortCount: 1,
      measuredHeightsByKey: {
        [getKwargsControlsHeightKey(sectionId)]: 13,
      },
      headerHeight: 7,
      pinnedRowCount: 3,
      sectionId,
    });

    expect(metrics.edgesHeight).toBe(
      resolveEdgeStripHeight({
        inputPortCount: 2,
        outputPortCount: 1,
      }),
    );
    expect(metrics.contentTop).toBe(7 + 13 + 5);
    expect(metrics.paramsFixedHeight).toBe(
      resolveEdgeStripHeight({
        inputPortCount: 2,
        outputPortCount: 1,
      }) +
        3 * 24,
    );
  });

  it("sizes pinned surfaces from retained row content instead of measured height state", () => {
    expect(
      getProjectGpuParamListSurfaceHeight({
        contentHeight: 96,
        listKey: "pinned",
        remainingHeight: 200,
      }),
    ).toBe(96);
    expect(
      getProjectGpuParamListSurfaceHeight({
        contentHeight: 96,
        listKey: "pinned",
        remainingHeight: 48,
      }),
    ).toBe(48);
  });
});
