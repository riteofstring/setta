import type { ParamEditorKind } from "./paramEditorActivation";

export const LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_START_MARK_NAME =
  "setta.liveDictAreaPixi.valueRowHandoff.start";
export const LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_OVERLAY_MARK_NAME =
  "setta.liveDictAreaPixi.valueRowHandoff.overlayMounted";
export const LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_READY_MARK_NAME =
  "setta.liveDictAreaPixi.valueRowHandoff.editorReady";
export const LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_OVERLAY_MEASURE_NAME =
  "setta.liveDictAreaPixi.valueRowHandoff.overlayLatency";
export const LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_READY_MEASURE_NAME =
  "setta.liveDictAreaPixi.valueRowHandoff.readyLatency";

export type LiveDictAreaPixiValueRowPerfDetail = {
  editorKind: ParamEditorKind;
  rowId: string;
};

let activePerfDetail: LiveDictAreaPixiValueRowPerfDetail | null = null;

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

function clearLiveDictAreaPixiValueRowPerfEntries(perf: Performance) {
  perf.clearMarks(LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_START_MARK_NAME);
  perf.clearMarks(LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_OVERLAY_MARK_NAME);
  perf.clearMarks(LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_READY_MARK_NAME);
  perf.clearMeasures(
    LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_OVERLAY_MEASURE_NAME,
  );
  perf.clearMeasures(LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_READY_MEASURE_NAME);
}

function isActivePerfDetail(detail: LiveDictAreaPixiValueRowPerfDetail) {
  return (
    activePerfDetail?.rowId === detail.rowId &&
    activePerfDetail.editorKind === detail.editorKind
  );
}

export function resetLiveDictAreaPixiValueRowPerfTimeline() {
  activePerfDetail = null;
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
}
