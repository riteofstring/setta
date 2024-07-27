import BASE_UI_TYPES from "constants/BaseUITypes.json";
import _ from "lodash";
import { dbLoadFullProject } from "requests/projects";
import { REACT_FLOW_STORE, setDbSourceMapping } from "utils/constants";
import { setAllCodeInfo } from "../codeInfo";
import { setAllEVCols } from "../evCols";
import { setNodes } from "../nodeInternals";
import { setAllOutputGroups } from "../outputGroups";
import { setAllOutputs } from "../outputs";
import { setAllParamSweeps } from "../paramSweep";
import { setAllRunGroups } from "../runGroups";
import { updateManyParamsAndCallables } from "../sectionContents";
import { setAllSectionInfos } from "../sectionInfos";
import { setAllUITypeCols } from "../uiTypeCols";
import { setAllUITypes } from "../uiTypes";
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
