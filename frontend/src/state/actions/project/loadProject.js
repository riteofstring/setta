import { router } from "components/Pages/router";
import BASE_UI_TYPES from "constants/BaseUITypes.json";
import _ from "lodash";
import { dbCreateProjectConfig, dbLoadFullProject } from "requests/projects";
import {
  PAGE_LOAD_TYPES,
  PROJECT_CONFIG_PREVIEW_IMG_COLORS,
  REACT_FLOW_STORE,
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
import { setOtherProjectConfigs } from "./otherProjectConfigs";
import { setProjectConfig } from "./projectConfig";

export async function loadProject({ projectConfigName }) {
  const res = await dbLoadFullProject();
  console.log("loadProject", res);
  if (res.status === 200) {
    const projectConfig = res.data.find(
      (x) => x.projectConfig.name === projectConfigName,
    ).projectConfig;
    const configsMerged = _.merge(
      {},
      ...res.data.map((x) => _.omit(x, ["projectConfig"])),
    );
    const projectState = { projectConfig, ...configsMerged };
    setOtherProjectConfigs(res.data.map((x) => x.projectConfig));
    return loadProjectState(projectState);
  } else {
    return false;
  }
}

export function loadProjectState({
  projectConfig,
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
  setProjectConfig(_.omit(projectConfig, ["viewport", "children"]));
  REACT_FLOW_STORE.initialViewport = projectConfig.viewport;
  setNodes(
    _.map(projectConfig.children, (v, k) => ({
      id: k,
      position: { x: v.x, y: v.y },
      zIndex: v.zIndex,
      tempZIndex: v.zIndex,
    })),
  );
  setAllUITypes({ ...uiTypes, ...BASE_UI_TYPES });
  setAllEVCols(evCols);
  setAllUITypeCols({ uiTypeCols });
  setAllParamSweeps(paramSweeps);
  setAllRunGroups(runGroups);
  setAllSectionInfos({ sections });
  setAllOutputs(outputs);
  setAllOutputGroups(outputGroups);
  updateManyParamsAndCallables(Object.keys(sections));
  maybeIncrementProjectStateVersion(true, false);
  return true;
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
