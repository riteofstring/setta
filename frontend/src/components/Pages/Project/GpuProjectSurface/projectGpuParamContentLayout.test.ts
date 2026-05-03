import { resolveEdgeStripHeight } from "components/Params/edgeStripUtils";
import { describe, expect, it } from "vitest";
import {
  PROJECT_GPU_PARAM_CONTENT_BASE_VERTICAL_CHROME_PX,
  PROJECT_GPU_PARAM_CONTENT_UNPINNED_TOP_GAP_WITH_PINNED_PX,
  getProjectGpuParamContentControlWidth,
  getProjectGpuParamContentLabelColumnWidth,
  getProjectGpuParamContentMetrics,
  getProjectGpuParamListLocalY,
  getProjectGpuParamListSurfaceHeight,
  resolveProjectGpuParamAutoContentHeight,
  resolveProjectGpuParamContentVerticalChromeHeight,
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
    expect(metrics.unpinnedTopGap).toBe(
      PROJECT_GPU_PARAM_CONTENT_UNPINNED_TOP_GAP_WITH_PINNED_PX,
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

  it("preserves the retained gap between pinned and unpinned param surfaces", () => {
    const metrics = getProjectGpuParamContentMetrics({
      edgeInputPortCount: 0,
      edgeOutputPortCount: 0,
      headerHeight: 7,
      kwargsControlsHeight: 13,
      pinnedRowCount: 2,
    });
    expect(
      getProjectGpuParamListLocalY({
        listKey: "unpinned",
        metrics,
        nextLocalY: metrics.contentTop + 2 * 24,
      }),
    ).toBe(
      metrics.contentTop +
        2 * 24 +
        PROJECT_GPU_PARAM_CONTENT_UNPINNED_TOP_GAP_WITH_PINNED_PX,
    );
    expect(
      resolveProjectGpuParamAutoContentHeight({
        edgeInputPortCount: 0,
        edgeOutputPortCount: 0,
        pinnedRowCount: 2,
        unpinnedRowCount: 3,
      }),
    ).toBe(5 * 24 + PROJECT_GPU_PARAM_CONTENT_UNPINNED_TOP_GAP_WITH_PINNED_PX);
  });

  it("reserves one retained row of content for empty visible param sections", () => {
    expect(
      resolveProjectGpuParamAutoContentHeight({
        edgeInputPortCount: 0,
        edgeOutputPortCount: 0,
        pinnedRowCount: 0,
        unpinnedRowCount: 0,
      }),
    ).toBe(24);
    expect(
      resolveProjectGpuParamAutoContentHeight({
        edgeInputPortCount: 0,
        edgeOutputPortCount: 0,
        pinnedRowCount: 0,
        reserveEmptyContentHeight: false,
        unpinnedRowCount: 0,
      }),
    ).toBe(0);
  });

  it("adds retained vertical chrome only for nested param rows", () => {
    expect(
      resolveProjectGpuParamContentVerticalChromeHeight({
        hasNestedBlockBottomChrome: false,
      }),
    ).toBe(PROJECT_GPU_PARAM_CONTENT_BASE_VERTICAL_CHROME_PX);
    expect(
      resolveProjectGpuParamContentVerticalChromeHeight({
        hasNestedBlockBottomChrome: true,
      }),
    ).toBe(PROJECT_GPU_PARAM_CONTENT_BASE_VERTICAL_CHROME_PX + 4);
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
