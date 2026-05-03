import {
  useProjectState,
  useResizeEvent,
  useSettings,
  useTemporaryMiscState,
  type ZustandProjectState,
} from "state/definitions";
import {
  getEdgesStripHeightKey,
  getKwargsControlsHeightKey,
  getParamsFixedHeightKey,
  getPinnedParamsAreaHeightKey,
  getSectionHeaderHeightKey,
  getSectionSearchHeightKey,
} from "utils/constants";
import {
  getProjectSceneMeasuredHeightFromRecord,
  type ProjectGpuSceneResizePolicyContext,
} from "./projectGpuSceneResizePolicy";
import { getProjectGpuSceneSectionIds } from "./projectGpuSectionSceneTree";

type ProjectGpuSceneMeasuredHeightKeyCreator = (sectionId: string) => string;

const PROJECT_GPU_SCENE_MEASURED_HEIGHT_KEY_CREATORS: readonly ProjectGpuSceneMeasuredHeightKeyCreator[] =
  [
    getEdgesStripHeightKey,
    getKwargsControlsHeightKey,
    getParamsFixedHeightKey,
    getPinnedParamsAreaHeightKey,
    getSectionHeaderHeightKey,
    getSectionSearchHeightKey,
  ];

export function getProjectGpuSceneMeasuredHeights(
  projectState: ZustandProjectState,
  measuredHeightsByKey: Readonly<Record<string, unknown>>,
): Readonly<Record<string, number>> {
  const sceneMeasuredHeights: Record<string, number> = {};
  for (const sectionId of getProjectGpuSceneSectionIds(projectState)) {
    for (const getHeightKey of PROJECT_GPU_SCENE_MEASURED_HEIGHT_KEY_CREATORS) {
      const heightKey = getHeightKey(sectionId);
      sceneMeasuredHeights[heightKey] = getProjectSceneMeasuredHeightFromRecord(
        measuredHeightsByKey,
        heightKey,
      );
    }
  }
  return sceneMeasuredHeights;
}

export function areProjectGpuSceneMeasuredHeightsEqual(
  left: Readonly<Record<string, number>>,
  right: Readonly<Record<string, number>>,
): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  for (const key of leftKeys) {
    if (left[key] !== right[key]) {
      return false;
    }
  }
  return true;
}

export function getProjectGpuSceneResizePolicyContext(): ProjectGpuSceneResizePolicyContext {
  const projectState = useProjectState.getState();
  return {
    measuredHeightsByKey: getProjectGpuSceneMeasuredHeights(
      projectState,
      useTemporaryMiscState.getState(),
    ),
    resizeEventBySectionId: useResizeEvent.getState().resizeEvent,
    sizingPolicy: useSettings.getState().sectionSizingPolicy,
  };
}
