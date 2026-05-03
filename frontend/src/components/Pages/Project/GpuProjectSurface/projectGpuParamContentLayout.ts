import { resolveEdgeStripHeight } from "components/Params/edgeStripUtils";

export type ProjectGpuParamListKey = "pinned" | "unpinned";

export const PROJECT_GPU_PARAM_CONTENT_ROW_HEIGHT_PX = 24;
export const PROJECT_GPU_PARAM_CONTENT_LABEL_CONTROL_GAP_PX = 12;
export const PROJECT_GPU_PARAM_CONTENT_CONTROL_RIGHT_INSET_PX = 9;

const PROJECT_GPU_PARAM_CONTENT_TOP_INSET_PX = 5;
const PROJECT_GPU_PARAM_CONTENT_LABEL_COLUMN_WIDTH_PX = 65;

export function getProjectGpuParamContentControlWidth(width: number): number {
  return Math.max(
    0,
    width -
      PROJECT_GPU_PARAM_CONTENT_LABEL_COLUMN_WIDTH_PX -
      PROJECT_GPU_PARAM_CONTENT_LABEL_CONTROL_GAP_PX -
      PROJECT_GPU_PARAM_CONTENT_CONTROL_RIGHT_INSET_PX,
  );
}

export function getProjectGpuParamContentMetrics({
  edgeInputPortCount,
  edgeOutputPortCount,
  headerHeight,
  kwargsControlsHeight,
  pinnedRowCount,
}: {
  readonly edgeInputPortCount: number;
  readonly edgeOutputPortCount: number;
  readonly headerHeight: number;
  readonly kwargsControlsHeight: number;
  readonly pinnedRowCount: number;
}) {
  const edgesHeight = resolveEdgeStripHeight({
    inputPortCount: edgeInputPortCount,
    outputPortCount: edgeOutputPortCount,
  });
  const paramsFixedHeight = resolveProjectGpuParamFixedContentHeight({
    edgeInputPortCount,
    edgeOutputPortCount,
    pinnedRowCount,
  });
  return {
    contentTop:
      headerHeight +
      kwargsControlsHeight +
      PROJECT_GPU_PARAM_CONTENT_TOP_INSET_PX,
    edgesHeight,
    paramsFixedHeight,
  };
}

export function resolveProjectGpuParamFixedContentHeight({
  edgeInputPortCount,
  edgeOutputPortCount,
  pinnedRowCount,
}: {
  readonly edgeInputPortCount: number;
  readonly edgeOutputPortCount: number;
  readonly pinnedRowCount: number;
}): number {
  const edgeStripHeight = resolveEdgeStripHeight({
    inputPortCount: edgeInputPortCount,
    outputPortCount: edgeOutputPortCount,
  });
  const pinnedContentHeight =
    Math.max(0, pinnedRowCount) * PROJECT_GPU_PARAM_CONTENT_ROW_HEIGHT_PX;
  return edgeStripHeight + pinnedContentHeight;
}

export function getProjectGpuParamListLocalY({
  listKey,
  metrics,
  nextLocalY,
}: {
  readonly listKey: ProjectGpuParamListKey;
  readonly metrics: ReturnType<typeof getProjectGpuParamContentMetrics>;
  readonly nextLocalY: number;
}): number {
  if (listKey === "pinned") {
    return metrics.contentTop + metrics.edgesHeight;
  }
  return Math.max(nextLocalY, metrics.contentTop + metrics.paramsFixedHeight);
}

export function getProjectGpuParamListSurfaceHeight({
  contentHeight,
  listKey,
  remainingHeight,
}: {
  readonly contentHeight: number;
  readonly listKey: ProjectGpuParamListKey;
  readonly remainingHeight: number;
}): number {
  if (listKey === "pinned") {
    return Math.min(remainingHeight, contentHeight);
  }
  return remainingHeight;
}

export function getProjectGpuParamNextLocalY({
  height,
  listKey,
  listLocalY,
  metrics,
}: {
  readonly height: number;
  readonly listKey: ProjectGpuParamListKey;
  readonly listLocalY: number;
  readonly metrics: ReturnType<typeof getProjectGpuParamContentMetrics>;
}): number {
  if (listKey === "pinned" && metrics.paramsFixedHeight > 0) {
    return Math.max(
      listLocalY + height,
      metrics.contentTop + metrics.paramsFixedHeight,
    );
  }
  return listLocalY + height;
}
