import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_OVERLAY_MARK_NAME,
  LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_OVERLAY_MEASURE_NAME,
  LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_READY_MARK_NAME,
  LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_READY_MEASURE_NAME,
  LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_START_MARK_NAME,
  markLiveDictAreaPixiValueRowEditorReady,
  markLiveDictAreaPixiValueRowHandoffStart,
  markLiveDictAreaPixiValueRowOverlayMounted,
  resetLiveDictAreaPixiValueRowPerfTimeline,
} from "./liveDictAreaPixiValueRowPerf";

describe("liveDictAreaPixiValueRowPerf", () => {
  beforeEach(() => {
    resetLiveDictAreaPixiValueRowPerfTimeline();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetLiveDictAreaPixiValueRowPerfTimeline();
  });

  it("records start, overlay, and ready entries for the active handoff row", () => {
    const markSpy = vi
      .spyOn(performance, "mark")
      .mockImplementation(() => undefined as PerformanceMark);
    const measureSpy = vi
      .spyOn(performance, "measure")
      .mockImplementation(() => undefined as PerformanceMeasure);
    const clearMarksSpy = vi
      .spyOn(performance, "clearMarks")
      .mockImplementation(() => undefined);
    const clearMeasuresSpy = vi
      .spyOn(performance, "clearMeasures")
      .mockImplementation(() => undefined);
    const detail = {
      editorKind: "codemirror",
      rowId: "defaultZoomLevel",
    } as const;

    markLiveDictAreaPixiValueRowHandoffStart(detail);
    markLiveDictAreaPixiValueRowOverlayMounted(detail);
    markLiveDictAreaPixiValueRowEditorReady(detail);

    expect(clearMarksSpy).toHaveBeenCalledWith(
      LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_START_MARK_NAME,
    );
    expect(clearMarksSpy).toHaveBeenCalledWith(
      LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_OVERLAY_MARK_NAME,
    );
    expect(clearMarksSpy).toHaveBeenCalledWith(
      LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_READY_MARK_NAME,
    );
    expect(clearMeasuresSpy).toHaveBeenCalledWith(
      LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_OVERLAY_MEASURE_NAME,
    );
    expect(clearMeasuresSpy).toHaveBeenCalledWith(
      LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_READY_MEASURE_NAME,
    );
    expect(markSpy).toHaveBeenCalledWith(
      LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_START_MARK_NAME,
      { detail },
    );
    expect(markSpy).toHaveBeenCalledWith(
      LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_OVERLAY_MARK_NAME,
      { detail },
    );
    expect(markSpy).toHaveBeenCalledWith(
      LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_READY_MARK_NAME,
      { detail },
    );
    expect(measureSpy).toHaveBeenCalledWith(
      LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_OVERLAY_MEASURE_NAME,
      LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_START_MARK_NAME,
      LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_OVERLAY_MARK_NAME,
    );
    expect(measureSpy).toHaveBeenCalledWith(
      LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_READY_MEASURE_NAME,
      LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_START_MARK_NAME,
      LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_READY_MARK_NAME,
    );
  });

  it("does not measure stale overlay or ready events for a different row", () => {
    const measureSpy = vi
      .spyOn(performance, "measure")
      .mockImplementation(() => undefined as PerformanceMeasure);

    markLiveDictAreaPixiValueRowHandoffStart({
      editorKind: "codemirror",
      rowId: "defaultZoomLevel",
    });
    markLiveDictAreaPixiValueRowOverlayMounted({
      editorKind: "codemirror",
      rowId: "gridColor",
    });
    markLiveDictAreaPixiValueRowEditorReady({
      editorKind: "codemirror",
      rowId: "gridColor",
    });

    expect(measureSpy).not.toHaveBeenCalled();
  });
});
