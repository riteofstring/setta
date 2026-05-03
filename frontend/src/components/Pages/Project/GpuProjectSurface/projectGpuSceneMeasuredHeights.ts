import { getCurrEffectiveSectionImplIfPresent } from "state/actions/sectionInfos";
import {
  useProjectState,
  useResizeEvent,
  useSettings,
  useTemporaryMiscState,
  type ZustandProjectState,
} from "state/definitions";
import {
  getKwargsControlsHeightKey,
  getParamsFixedHeightKey,
} from "utils/constants";
import { SectionTypeEnum } from "utils/generatedTypes";
import {
  getProjectSceneMeasuredHeightFromRecord,
  type ProjectGpuSceneResizePolicyContext,
} from "./projectGpuSceneResizePolicy";
import { getProjectGpuSceneSectionIds } from "./projectGpuSectionSceneTree";

type ProjectGpuSceneMeasuredHeightKeyCreator = (sectionId: string) => string;

const PROJECT_GPU_SCENE_MEASURED_HEIGHT_KEY_CREATORS: readonly ProjectGpuSceneMeasuredHeightKeyCreator[] =
  [getKwargsControlsHeightKey];

export function getProjectGpuSceneMeasuredHeights(
  projectState: ZustandProjectState,
  measuredHeightsByKey: Readonly<Record<string, unknown>>,
): Readonly<Record<string, number>> {
  const sceneMeasuredHeights: Record<string, number> = {};
  for (const sectionId of getProjectGpuSceneSectionIds(projectState)) {
    for (const getHeightKey of getProjectGpuSceneMeasuredHeightKeyCreators(
      projectState,
      sectionId,
    )) {
      const heightKey = getHeightKey(sectionId);
      sceneMeasuredHeights[heightKey] = getProjectSceneMeasuredHeightFromRecord(
        measuredHeightsByKey,
        heightKey,
      );
    }
  }
  return sceneMeasuredHeights;
}

function getProjectGpuSceneMeasuredHeightKeyCreators(
  projectState: ZustandProjectState,
  sectionId: string,
): readonly ProjectGpuSceneMeasuredHeightKeyCreator[] {
  const sectionImpl = getCurrEffectiveSectionImplIfPresent(
    projectState,
    sectionId,
  );
  if (sectionImpl?.type === SectionTypeEnum.Dict) {
    return PROJECT_GPU_SCENE_MEASURED_HEIGHT_KEY_CREATORS;
  }
  return [
    ...PROJECT_GPU_SCENE_MEASURED_HEIGHT_KEY_CREATORS,
    getParamsFixedHeightKey,
  ];
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
