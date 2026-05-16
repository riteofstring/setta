import { resolveEdgeStripHeight } from "components/Params/edgeStripUtils";
import { resolveParamColumnWidth } from "state/hooks/paramColumnWidthUtils";

export type ProjectGpuParamListKey = "pinned" | "unpinned";

export const PROJECT_GPU_PARAM_CONTENT_ROW_HEIGHT_PX = 24;
export const PROJECT_GPU_PARAM_CONTENT_NESTED_GUTTER_PX = 12;
export const PROJECT_GPU_PARAM_CONTENT_NESTED_BLOCK_START_GAP_PX = 4;
export const PROJECT_GPU_PARAM_CONTENT_LABEL_CONTROL_GAP_PX = 12;
export const PROJECT_GPU_PARAM_CONTENT_CONTROL_RIGHT_INSET_PX = 9;
export const PROJECT_GPU_PARAM_CONTENT_UNPINNED_TOP_GAP_WITH_PINNED_PX = 4;

const PROJECT_GPU_PARAM_CONTENT_TOP_INSET_PX = 5;
export const PROJECT_GPU_PARAM_CONTENT_BASE_VERTICAL_CHROME_PX = 18;
const PROJECT_GPU_PARAM_CONTENT_NESTED_VERTICAL_CHROME_PX = 4;

export function resolveProjectGpuParamContentVerticalChromeHeight({
  hasNestedBlockBottomChrome,
}: {
  readonly hasNestedBlockBottomChrome: boolean;
}): number {
  return (
    PROJECT_GPU_PARAM_CONTENT_BASE_VERTICAL_CHROME_PX +
    (hasNestedBlockBottomChrome
      ? PROJECT_GPU_PARAM_CONTENT_NESTED_VERTICAL_CHROME_PX
      : 0)
  );
}

export function getProjectGpuParamContentLabelColumnWidth({
  maxNestedDepth,
  persistedColumnWidth,
  width,
}: {
  readonly maxNestedDepth: number;
  readonly persistedColumnWidth?: number | null | undefined;
  readonly width: number;
}): number {
  return resolveParamColumnWidth({
    containerWidth: width,
    maxNestedDepth,
    persistedColumnWidth,
  });
}

export function getProjectGpuParamContentControlWidth({
  maxNestedDepth,
  persistedColumnWidth,
  width,
}: {
  readonly maxNestedDepth: number;
  readonly persistedColumnWidth?: number | null | undefined;
  readonly width: number;
}): number {
  const labelColumnWidth = getProjectGpuParamContentLabelColumnWidth({
    maxNestedDepth,
    persistedColumnWidth,
    width,
  });
  return Math.max(
    0,
    width -
      labelColumnWidth -
      PROJECT_GPU_PARAM_CONTENT_LABEL_CONTROL_GAP_PX -
      PROJECT_GPU_PARAM_CONTENT_CONTROL_RIGHT_INSET_PX,
  );
}

export function getProjectGpuParamContentMetrics({
  edgeInputPortCount,
  edgeOutputPortCount,
  headerHeight,
  kwargsControlsHeight,
  pinnedRowVerticalGapHeight = 0,
  pinnedRowCount,
}: {
  readonly edgeInputPortCount: number;
  readonly edgeOutputPortCount: number;
  readonly headerHeight: number;
  readonly kwargsControlsHeight: number;
  readonly pinnedRowVerticalGapHeight?: number | undefined;
  readonly pinnedRowCount: number;
}) {
  const edgesHeight = resolveEdgeStripHeight({
    inputPortCount: edgeInputPortCount,
    outputPortCount: edgeOutputPortCount,
  });
  const paramsFixedHeight = resolveProjectGpuParamFixedContentHeight({
    edgeInputPortCount,
    edgeOutputPortCount,
    pinnedRowVerticalGapHeight,
    pinnedRowCount,
  });
  const unpinnedTopGap =
    pinnedRowCount > 0
      ? PROJECT_GPU_PARAM_CONTENT_UNPINNED_TOP_GAP_WITH_PINNED_PX
      : 0;
  return {
    contentTop:
      headerHeight +
      kwargsControlsHeight +
      PROJECT_GPU_PARAM_CONTENT_TOP_INSET_PX,
    edgesHeight,
    paramsFixedHeight,
    unpinnedTopGap,
  };
}

export function resolveProjectGpuParamFixedContentHeight({
  edgeInputPortCount,
  edgeOutputPortCount,
  pinnedRowVerticalGapHeight = 0,
  pinnedRowCount,
}: {
  readonly edgeInputPortCount: number;
  readonly edgeOutputPortCount: number;
  readonly pinnedRowVerticalGapHeight?: number | undefined;
  readonly pinnedRowCount: number;
}): number {
  const edgeStripHeight = resolveEdgeStripHeight({
    inputPortCount: edgeInputPortCount,
    outputPortCount: edgeOutputPortCount,
  });
  const pinnedContentHeight =
    Math.max(0, pinnedRowCount) * PROJECT_GPU_PARAM_CONTENT_ROW_HEIGHT_PX +
    Math.max(0, pinnedRowVerticalGapHeight);
  return edgeStripHeight + pinnedContentHeight;
}

export function resolveProjectGpuParamAutoContentHeight({
  edgeInputPortCount,
  edgeOutputPortCount,
  pinnedRowCount,
  reserveEmptyContentHeight = true,
  unpinnedRowCount,
}: {
  readonly edgeInputPortCount: number;
  readonly edgeOutputPortCount: number;
  readonly pinnedRowCount: number;
  readonly reserveEmptyContentHeight?: boolean | undefined;
  readonly unpinnedRowCount: number;
}): number {
  const edgeStripHeight = resolveEdgeStripHeight({
    inputPortCount: edgeInputPortCount,
    outputPortCount: edgeOutputPortCount,
  });
  const rowCount = Math.max(0, pinnedRowCount) + Math.max(0, unpinnedRowCount);
  const unpinnedTopGap =
    pinnedRowCount > 0 && unpinnedRowCount > 0
      ? PROJECT_GPU_PARAM_CONTENT_UNPINNED_TOP_GAP_WITH_PINNED_PX
      : 0;
  const retainedRowHeight =
    rowCount > 0 || edgeStripHeight > 0 || !reserveEmptyContentHeight
      ? rowCount * PROJECT_GPU_PARAM_CONTENT_ROW_HEIGHT_PX + unpinnedTopGap
      : PROJECT_GPU_PARAM_CONTENT_ROW_HEIGHT_PX;
  return edgeStripHeight + retainedRowHeight;
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
  return (
    Math.max(nextLocalY, metrics.contentTop + metrics.paramsFixedHeight) +
    metrics.unpinnedTopGap
  );
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
