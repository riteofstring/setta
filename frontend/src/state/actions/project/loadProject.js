import { router } from "components/Pages/router";
import BASE_UI_TYPES from "constants/BaseUITypes.json";
import _ from "lodash";
import { dbCreateProjectConfig, dbLoadFullProject } from "requests/projects";
import {
  useAllProjectConfigs,
  useNodeInternals,
  useProjectConfig,
  useStateVersion,
} from "state/definitions";
import {
  PAGE_LOAD_TYPES,
  PROJECT_CONFIG_PREVIEW_IMG_COLORS,
  setDbSourceMapping,
} from "utils/constants";
import { setAllCodeInfo } from "../codeInfo";
import { setAllEVCols } from "../evCols";
import { setNodes } from "../nodeInternals";
import { setAllOutputGroups } from "../outputs/outputGroups";
import { setAllOutputs } from "../outputs/outputs";
import { setAllParamSweeps } from "../runGroups/paramSweep";
import { setAllRunGroups } from "../runGroups/runGroups";
import { updateManyParamsAndCallables } from "../sections/sectionContents";
import { setAllSectionInfos } from "../sections/sectionInfos";
import { setAllUITypeCols } from "../uiTypes/uiTypeCols";
import { setAllUITypes } from "../uiTypes/uiTypes";
import { maybeIncrementProjectStateVersion } from "../undo";
import { setAllProjectConfigs } from "./allProjectConfigs";
import { setProjectConfig } from "./projectConfig";

export async function loadFullProject() {
  const res = await dbLoadFullProject();
  if (res.status === 200) {
    const configsMerged = _.merge(
      {},
      ...res.data.map((x) => _.omit(x, ["projectConfig"])),
    );
    setAllProjectConfigs(res.data.map((x) => x.projectConfig));
    return loadProjectState(configsMerged);
  } else {
    return false;
  }
}

export function loadProjectState({
  codeInfo,
  sections,
  evCols,
  uiTypes,
  uiTypeCols,
  paramSweeps,
  runGroups,
  outputs,
  outputGroups,
  dbSourceMapping,
}) {
  setDbSourceMapping(dbSourceMapping);
  setAllCodeInfo(codeInfo);
  setAllUITypes({ ...uiTypes, ...BASE_UI_TYPES });
  setAllEVCols(evCols);
  setAllUITypeCols({ uiTypeCols });
  setAllParamSweeps(paramSweeps);
  setAllRunGroups(runGroups);
  setAllSectionInfos({ sections });
  setAllOutputs(outputs);
  setAllOutputGroups(outputGroups);
  updateManyParamsAndCallables(Object.keys(sections));
  return true;
}

export function loadProjectConfigState(projectConfigName) {
  const projectConfig = useAllProjectConfigs
    .getState()
    .x.find((x) => x.name === projectConfigName);
  setNodes(
    _.map(projectConfig.children, (v, k) => ({
      id: k,
      position: { x: v.x, y: v.y },
      zIndex: v.zIndex,
      tempZIndex: v.zIndex,
    })),
  );
  setProjectConfig(_.omit(projectConfig, ["children"]));
  maybeIncrementProjectStateVersion(true, false);
}

export function resetProjectConfigState() {
  useProjectConfig.getState().reset();
  useNodeInternals.getState().reset();
  useStateVersion.getState().reset();
}

export async function createAndGoToProjectConfig({ name }) {
  const previewImgColor = getRandomProjectConfigPreviewImgColor();
  const { data: newProjectName } = await dbCreateProjectConfig({
    name,
    previewImgColor,
  });
  router.navigate(newProjectName, {
    state: { pageLoadType: PAGE_LOAD_TYPES.LOAD_PROJECT_CONFIG },
  });
}

function getRandomProjectConfigPreviewImgColor() {
  const randomIndex = Math.floor(
    Math.random() * PROJECT_CONFIG_PREVIEW_IMG_COLORS.length,
  );
  return PROJECT_CONFIG_PREVIEW_IMG_COLORS[randomIndex];
}
