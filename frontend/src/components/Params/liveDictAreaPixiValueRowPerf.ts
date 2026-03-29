import type { ParamEditorKind } from "./paramEditorActivation";

export const LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_START_MARK_NAME =
  "setta.liveDictAreaPixi.valueRowHandoff.start";
export const LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_OVERLAY_MARK_NAME =
  "setta.liveDictAreaPixi.valueRowHandoff.overlayMounted";
export const LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_READY_MARK_NAME =
  "setta.liveDictAreaPixi.valueRowHandoff.editorReady";
export const LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_PRESENTED_MARK_NAME =
  "setta.liveDictAreaPixi.valueRowHandoff.presented";
export const LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_OVERLAY_MEASURE_NAME =
  "setta.liveDictAreaPixi.valueRowHandoff.overlayLatency";
export const LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_READY_MEASURE_NAME =
  "setta.liveDictAreaPixi.valueRowHandoff.readyLatency";
export const LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_PRESENTED_MEASURE_NAME =
  "setta.liveDictAreaPixi.valueRowHandoff.presentedLatency";
export const LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_PRESENTATION_TAIL_MEASURE_NAME =
  "setta.liveDictAreaPixi.valueRowHandoff.presentationTailLatency";

export type LiveDictAreaPixiValueRowPerfDetail = {
  editorKind: ParamEditorKind;
  rowId: string;
};

let activePerfDetail: LiveDictAreaPixiValueRowPerfDetail | null = null;
let pendingPresentedFrameHandle: number | null = null;
let pendingPresentedCommitFrameHandle: number | null = null;

function getPerformanceTimeline(): Performance | null {
  if (
    typeof performance === "undefined" ||
    typeof performance.mark !== "function" ||
    typeof performance.measure !== "function" ||
    typeof performance.clearMarks !== "function" ||
    typeof performance.clearMeasures !== "function"
  ) {
    return null;
  }

  return performance;
}

function getRequestAnimationFrameFn():
  | ((callback: FrameRequestCallback) => number)
  | null {
  if (typeof requestAnimationFrame !== "function") {
    return null;
  }

  return requestAnimationFrame;
}

function getCancelAnimationFrameFn(): ((handle: number) => void) | null {
  if (typeof cancelAnimationFrame !== "function") {
    return null;
  }

  return cancelAnimationFrame;
}

function cancelPendingPresentedMark() {
  const cancelAnimationFrameFn = getCancelAnimationFrameFn();
  if (cancelAnimationFrameFn && pendingPresentedFrameHandle !== null) {
    cancelAnimationFrameFn(pendingPresentedFrameHandle);
  }
  if (cancelAnimationFrameFn && pendingPresentedCommitFrameHandle !== null) {
    cancelAnimationFrameFn(pendingPresentedCommitFrameHandle);
  }

  pendingPresentedFrameHandle = null;
  pendingPresentedCommitFrameHandle = null;
}

function clearLiveDictAreaPixiValueRowPerfEntries(perf: Performance) {
  perf.clearMarks(LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_START_MARK_NAME);
  perf.clearMarks(LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_OVERLAY_MARK_NAME);
  perf.clearMarks(LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_READY_MARK_NAME);
  perf.clearMarks(LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_PRESENTED_MARK_NAME);
  perf.clearMeasures(
    LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_OVERLAY_MEASURE_NAME,
  );
  perf.clearMeasures(LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_READY_MEASURE_NAME);
  perf.clearMeasures(
    LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_PRESENTED_MEASURE_NAME,
  );
  perf.clearMeasures(
    LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_PRESENTATION_TAIL_MEASURE_NAME,
  );
}

function isActivePerfDetail(detail: LiveDictAreaPixiValueRowPerfDetail) {
  return (
    activePerfDetail?.rowId === detail.rowId &&
    activePerfDetail.editorKind === detail.editorKind
  );
}

export function resetLiveDictAreaPixiValueRowPerfTimeline() {
  activePerfDetail = null;
  cancelPendingPresentedMark();
  const perf = getPerformanceTimeline();
  if (!perf) {
    return;
  }

  clearLiveDictAreaPixiValueRowPerfEntries(perf);
}

export function markLiveDictAreaPixiValueRowHandoffStart(
  detail: LiveDictAreaPixiValueRowPerfDetail,
) {
  activePerfDetail = detail;
  const perf = getPerformanceTimeline();
  if (!perf) {
    return;
  }

  cancelPendingPresentedMark();
  clearLiveDictAreaPixiValueRowPerfEntries(perf);
  perf.mark(LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_START_MARK_NAME, { detail });
}

export function markLiveDictAreaPixiValueRowOverlayMounted(
  detail: LiveDictAreaPixiValueRowPerfDetail,
) {
  const perf = getPerformanceTimeline();
  if (!perf) {
    return;
  }

  perf.mark(LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_OVERLAY_MARK_NAME, {
    detail,
  });
  if (!isActivePerfDetail(detail)) {
    return;
  }

  perf.measure(
    LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_OVERLAY_MEASURE_NAME,
    LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_START_MARK_NAME,
    LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_OVERLAY_MARK_NAME,
  );
}

export function markLiveDictAreaPixiValueRowEditorReady(
  detail: LiveDictAreaPixiValueRowPerfDetail,
) {
  const perf = getPerformanceTimeline();
  if (!perf) {
    return;
  }

  perf.mark(LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_READY_MARK_NAME, {
    detail,
  });
  if (!isActivePerfDetail(detail)) {
    return;
  }

  perf.measure(
    LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_READY_MEASURE_NAME,
    LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_START_MARK_NAME,
    LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_READY_MARK_NAME,
  );
  scheduleLiveDictAreaPixiValueRowPresented(detail, perf);
}

function scheduleLiveDictAreaPixiValueRowPresented(
  detail: LiveDictAreaPixiValueRowPerfDetail,
  perf: Performance,
) {
  const requestAnimationFrameFn = getRequestAnimationFrameFn();
  if (!requestAnimationFrameFn) {
    return;
  }

  cancelPendingPresentedMark();
  pendingPresentedFrameHandle = requestAnimationFrameFn(() => {
    pendingPresentedFrameHandle = null;
    pendingPresentedCommitFrameHandle = requestAnimationFrameFn(() => {
      pendingPresentedCommitFrameHandle = null;
      if (!isActivePerfDetail(detail)) {
        return;
      }

      perf.mark(LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_PRESENTED_MARK_NAME, {
        detail,
      });
      perf.measure(
        LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_PRESENTED_MEASURE_NAME,
        LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_START_MARK_NAME,
        LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_PRESENTED_MARK_NAME,
      );
      perf.measure(
        LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_PRESENTATION_TAIL_MEASURE_NAME,
        LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_READY_MARK_NAME,
        LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_PRESENTED_MARK_NAME,
      );
    });
  });
}
