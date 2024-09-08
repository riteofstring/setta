import { router } from "components/Pages/router";
import BASE_UI_TYPES from "constants/BaseUITypes.json";
import _ from "lodash";
import { dbCreateProjectConfig, dbLoadProjectConfig } from "requests/projects";
import {
  PAGE_LOAD_TYPES,
  PROJECT_CONFIG_PREVIEW_IMG_COLORS,
  setDbSourceMapping,
} from "utils/constants";
import { setAllCodeInfo } from "../codeInfo";
import { setNodes } from "../nodeInternals";
import { setAllParamSweeps } from "../runGroups/paramSweep";
import { setAllRunGroups } from "../runGroups/runGroups";
import { updateManyParamsAndCallables } from "../sections/sectionContents";
import { setAllSectionInfos } from "../sections/sectionInfos";
import { setAllSectionVariants } from "../sectionVariants";
import { setAllUITypeCols } from "../uiTypes/uiTypeCols";
import { setAllUITypes } from "../uiTypes/uiTypes";
import { maybeIncrementProjectStateVersion } from "../undo";
import { setProjectConfig } from "./projectConfig";

export async function loadProjectConfig({ projectConfigName }) {
  const res = await dbLoadProjectConfig(projectConfigName);
  if (res.status === 200) {
    console.log(res.data);
    return loadProjectState(res.data);
  } else {
    return false;
  }
}

export function loadProjectState({
  projectConfig,
  codeInfo,
  sections,
  sectionConfigs,
  sectionVariants,
  uiTypes,
  uiTypeCols,
  paramSweeps,
  runGroups,
  dbSourceMapping,
}) {
  setDbSourceMapping(dbSourceMapping);
  setAllCodeInfo(codeInfo);
  setProjectConfig(_.omit(projectConfig, ["children"]));
  setNodes(
    _.map(projectConfig.children, (v, k) => ({
      id: k,
      position: { x: v.x, y: v.y },
      zIndex: v.zIndex,
      tempZIndex: v.zIndex,
    })),
  );
  setAllUITypes({ ...uiTypes, ...BASE_UI_TYPES });
  setAllSectionVariants(sectionVariants);
  setAllUITypeCols({ uiTypeCols });
  setAllParamSweeps(paramSweeps);
  setAllRunGroups(runGroups);
  setAllSectionInfos({ sections, sectionConfigs });
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
