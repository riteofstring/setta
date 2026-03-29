import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_OVERLAY_MARK_NAME,
  LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_OVERLAY_MEASURE_NAME,
  LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_PRESENTATION_TAIL_MEASURE_NAME,
  LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_PRESENTED_MARK_NAME,
  LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_PRESENTED_MEASURE_NAME,
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
    const requestAnimationFrameCallbacks: FrameRequestCallback[] = [];
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback: FrameRequestCallback) => {
        requestAnimationFrameCallbacks.push(callback);
        return requestAnimationFrameCallbacks.length;
      }),
    );
    const cancelAnimationFrameSpy = vi.fn();
    vi.stubGlobal("cancelAnimationFrame", cancelAnimationFrameSpy);
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
    requestAnimationFrameCallbacks.shift()?.(16);
    requestAnimationFrameCallbacks.shift()?.(32);

    expect(clearMarksSpy).toHaveBeenCalledWith(
      LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_START_MARK_NAME,
    );
    expect(clearMarksSpy).toHaveBeenCalledWith(
      LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_OVERLAY_MARK_NAME,
    );
    expect(clearMarksSpy).toHaveBeenCalledWith(
      LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_READY_MARK_NAME,
    );
    expect(clearMarksSpy).toHaveBeenCalledWith(
      LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_PRESENTED_MARK_NAME,
    );
    expect(clearMeasuresSpy).toHaveBeenCalledWith(
      LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_OVERLAY_MEASURE_NAME,
    );
    expect(clearMeasuresSpy).toHaveBeenCalledWith(
      LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_READY_MEASURE_NAME,
    );
    expect(clearMeasuresSpy).toHaveBeenCalledWith(
      LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_PRESENTED_MEASURE_NAME,
    );
    expect(clearMeasuresSpy).toHaveBeenCalledWith(
      LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_PRESENTATION_TAIL_MEASURE_NAME,
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
    expect(markSpy).toHaveBeenCalledWith(
      LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_PRESENTED_MARK_NAME,
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
    expect(measureSpy).toHaveBeenCalledWith(
      LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_PRESENTED_MEASURE_NAME,
      LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_START_MARK_NAME,
      LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_PRESENTED_MARK_NAME,
    );
    expect(measureSpy).toHaveBeenCalledWith(
      LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_PRESENTATION_TAIL_MEASURE_NAME,
      LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_READY_MARK_NAME,
      LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_PRESENTED_MARK_NAME,
    );
    expect(cancelAnimationFrameSpy).not.toHaveBeenCalled();
  });

  it("does not measure stale overlay or ready events for a different row", () => {
    const requestAnimationFrameCallbacks: FrameRequestCallback[] = [];
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback: FrameRequestCallback) => {
        requestAnimationFrameCallbacks.push(callback);
        return requestAnimationFrameCallbacks.length;
      }),
    );
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
    requestAnimationFrameCallbacks.shift()?.(16);
    requestAnimationFrameCallbacks.shift()?.(32);

    expect(measureSpy).not.toHaveBeenCalled();
  });

  it("cancels a pending presented mark when a new handoff starts", () => {
    const requestAnimationFrameCallbacks: FrameRequestCallback[] = [];
    const requestAnimationFrameSpy = vi.fn((callback: FrameRequestCallback) => {
      requestAnimationFrameCallbacks.push(callback);
      return requestAnimationFrameCallbacks.length;
    });
    vi.stubGlobal("requestAnimationFrame", requestAnimationFrameSpy);
    const cancelAnimationFrameSpy = vi.fn();
    vi.stubGlobal("cancelAnimationFrame", cancelAnimationFrameSpy);

    markLiveDictAreaPixiValueRowHandoffStart({
      editorKind: "codemirror",
      rowId: "defaultZoomLevel",
    });
    markLiveDictAreaPixiValueRowEditorReady({
      editorKind: "codemirror",
      rowId: "defaultZoomLevel",
    });

    expect(requestAnimationFrameSpy).toHaveBeenCalledTimes(1);

    markLiveDictAreaPixiValueRowHandoffStart({
      editorKind: "codemirror",
      rowId: "gridColor",
    });

    expect(cancelAnimationFrameSpy).toHaveBeenCalledWith(1);
  });
});
