import { resolveEdgeStripHeight } from "components/Params/edgeStripUtils";
import { describe, expect, it } from "vitest";
import {
  getProjectGpuParamContentControlWidth,
  getProjectGpuParamContentLabelColumnWidth,
  getProjectGpuParamContentMetrics,
  getProjectGpuParamListSurfaceHeight,
} from "./projectGpuParamContentLayout";

describe("project GPU param content layout", () => {
  it("derives edge-strip spacing from scene metadata instead of measured height state", () => {
    const metrics = getProjectGpuParamContentMetrics({
      edgeInputPortCount: 2,
      edgeOutputPortCount: 1,
      headerHeight: 7,
      kwargsControlsHeight: 13,
      pinnedRowCount: 3,
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

  it("derives retained label/control columns from the param column-width contract", () => {
    expect(
      getProjectGpuParamContentLabelColumnWidth({
        maxNestedDepth: 1,
        width: 552,
      }),
    ).toBe(258);
    expect(
      getProjectGpuParamContentControlWidth({
        maxNestedDepth: 1,
        width: 552,
      }),
    ).toBe(273);
    expect(
      getProjectGpuParamContentControlWidth({
        maxNestedDepth: 1,
        persistedColumnWidth: 180,
        width: 552,
      }),
    ).toBe(351);
  });
});
