import BASE_UI_TYPES from "constants/BaseUITypes.json";
import _ from "lodash";
import { dbCreateProject, dbLoadFullProject } from "requests/projects";
import {
  projectPreviewImgColors,
  REACT_FLOW_STORE,
  setDbSourceMapping,
} from "utils/constants";
import { NEW_PROJECT } from "utils/Routes/pageLoadTypes";
import { router } from "utils/Routes/router";
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
import { setProject } from "./project";
import { setProjectConfig } from "./projectConfig";

export async function loadProject({ projectName, configName }) {
  const res = await dbLoadFullProject({ projectName });
  if (res.status === 200) {
    const projectConfig = res.data.configs.find(
      (x) => x.projectConfig.name === configName,
    ).projectConfig;
    const configsMerged = _.merge(
      {},
      ...res.data.configs.map((x) => _.omit(x, ["projectConfig"])),
    );
    const projectState = {
      project: _.omit(res.data, ["configs"]),
      projectConfig,
      ...configsMerged,
    };
    setOtherProjectConfigs(res.data.configs.map((x) => x.projectConfig));
    return loadProjectState(projectState);
  } else {
    return false;
  }
}

export function loadProjectState({
  project,
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
  if (project) {
    setProject(project);
  }
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

export async function createAndGoToProject({ name }) {
  const previewImgColor = getRandomProjectPreviewImgColor();
  const { data: newProject } = await dbCreateProject({ name, previewImgColor });
  goToDefaultConfig(newProject);
}

function goToProject({ project, configId }) {
  const configName = project.configs.find((x) => x.id === configId).name;
  const address = `${project.name}/${configName}`;
  router.navigate(address, { state: { pageLoadType: NEW_PROJECT } });
}

function goToDefaultConfig(project) {
  goToProject({
    project,
    configId: project.defaultConfigId,
  });
}

const getRandomProjectPreviewImgColor = () => {
  const randomIndex = Math.floor(
    Math.random() * projectPreviewImgColors.length,
  );
  return projectPreviewImgColors[randomIndex];
};
