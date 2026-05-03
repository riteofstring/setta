import { resolveEdgeStripHeight } from "components/Params/edgeStripUtils";
import {
  getKwargsControlsHeightKey,
  getParamsFixedHeightKey,
  getSectionHeaderHeightKey,
  getSectionSearchHeightKey,
} from "utils/constants";
import { getProjectSceneMeasuredHeightFromRecord } from "./projectGpuSceneResizePolicy";

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
  measuredHeightsByKey,
  sectionId,
}: {
  readonly edgeInputPortCount: number;
  readonly edgeOutputPortCount: number;
  readonly measuredHeightsByKey?: Readonly<Record<string, unknown>> | undefined;
  readonly sectionId: string;
}) {
  const headerHeight = getProjectSceneMeasuredHeightFromRecord(
    measuredHeightsByKey,
    getSectionHeaderHeightKey(sectionId),
  );
  const searchHeight = getProjectSceneMeasuredHeightFromRecord(
    measuredHeightsByKey,
    getSectionSearchHeightKey(sectionId),
  );
  const kwargsHeight = getProjectSceneMeasuredHeightFromRecord(
    measuredHeightsByKey,
    getKwargsControlsHeightKey(sectionId),
  );
  const edgesHeight = resolveEdgeStripHeight({
    inputPortCount: edgeInputPortCount,
    outputPortCount: edgeOutputPortCount,
  });
  const paramsFixedHeight = getProjectSceneMeasuredHeightFromRecord(
    measuredHeightsByKey,
    getParamsFixedHeightKey(sectionId),
  );
  return {
    contentTop:
      headerHeight +
      searchHeight +
      kwargsHeight +
      PROJECT_GPU_PARAM_CONTENT_TOP_INSET_PX,
    edgesHeight,
    paramsFixedHeight,
  };
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
