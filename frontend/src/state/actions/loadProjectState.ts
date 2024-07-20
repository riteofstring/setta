import BASE_UI_TYPES from "constants/BaseUITypes.json";
import _ from "lodash";
import { useEVCols } from "state/definitions/evCols";
import { useParamSweep } from "state/definitions/paramSweep";
import { useRunGroups } from "state/definitions/runGroups";
import { REACT_FLOW_STORE, setDbSourceMapping } from "utils/constants";
import { ProjectLoadType } from "z_utils/types/projectSaveLoad";
import { useProject } from "../definitions/project";
import { useProjectConfig } from "../definitions/projectConfig";
import { useProjectConfigCodeInfoMaps } from "../definitions/projectConfigCodeInfoMaps";
import { useSectionInfos } from "../definitions/sectionInfos";
import { useUITypeCols } from "../definitions/uiTypeCols";
import { useUITypes } from "../definitions/uiTypes";
import { useUserCodeInfoMaps } from "../definitions/userCodeInfoMaps";
import { setAllCodeInfo } from "./codeInfo";
import { setNodes } from "./nodeInternals";
import { setAllOutputGroups } from "./outputGroups";
import { setAllOutputs } from "./outputs";
import { updateManyParamsAndCallables } from "./sectionContents";
import { maybeIncrementProjectStateVersion } from "./undo";

export function loadProjectState({
  project,
  projectConfig,
  codeInfo,
  userCodeInfoMaps,
  projectConfigCodeInfoMaps,
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
    useProject.getState().resetAndSetAll(project);
  }
  useProjectConfig
    .getState()
    .resetAndSetAll(_.omit(projectConfig, ["viewport", "children"]));
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
  useEVCols.getState().resetAndSetAll({ evCols });
  useUITypeCols.getState().resetAndSetAll({ uiTypeCols });
  useParamSweep.getState().resetAndSetAll(paramSweeps);
  useRunGroups.getState().resetAndSetAll(runGroups);
  useUserCodeInfoMaps.getState().resetAndSetAll(userCodeInfoMaps);
  useProjectConfigCodeInfoMaps
    .getState()
    .resetAndSetAll(projectConfigCodeInfoMaps);
  useSectionInfos.getState().resetAndSetAll({ sections });
  setAllOutputs(outputs);
  setAllOutputGroups(outputGroups);
  updateManyParamsAndCallables(Object.keys(sections));
  maybeIncrementProjectStateVersion(true, false);
  return true;
}
