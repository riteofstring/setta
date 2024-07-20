import BASE_UI_TYPES from "constants/BaseUITypes.json";
import _ from "lodash";
import { REACT_FLOW_STORE, setDbSourceMapping } from "utils/constants";
import { ProjectLoadType } from "z_utils/types/projectSaveLoad";
import { useUITypes } from "../definitions/uiTypes";
import { setAllCodeInfo } from "./codeInfo";
import { setAllEVCols } from "./evCols";
import { setNodes } from "./nodeInternals";
import { setAllOutputGroups } from "./outputGroups";
import { setAllOutputs } from "./outputs";
import { setAllParamSweeps } from "./paramSweep";
import { setProject } from "./project";
import { setProjectConfig } from "./projectConfig";
import { setAllRunGroups } from "./runGroups";
import { updateManyParamsAndCallables } from "./sectionContents";
import { setAllSectionInfos } from "./sectionInfos";
import { setAllUITypeCols } from "./uiTypeCols";
import { maybeIncrementProjectStateVersion } from "./undo";

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
}: ProjectLoadType) {
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
  useUITypes.getState().resetAndSetAll({ ...uiTypes, ...BASE_UI_TYPES });
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
