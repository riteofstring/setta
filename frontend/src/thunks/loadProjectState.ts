import BASE_UI_TYPES from "constants/BaseUITypes.json";
import _ from "lodash";
import { useNodeInternals } from "models/info/nodeInternals";
import { useParamSweep } from "models/paramSweep";
import { useRunGroups } from "models/runGroups";
import { REACT_FLOW_STORE, setDbSourceMapping } from "utils/constants";
import { ProjectLoadType } from "z_utils/types/projectSaveLoad";
import { useProjectConfigCodeInfoMaps } from "../models/codeInfoMaps/projectConfigCodeInfoMaps";
import { useUserCodeInfoMaps } from "../models/codeInfoMaps/userCodeInfoMaps";
import { useCodeInfo } from "../models/info/codeInfo";
import { useOutputGroups } from "../models/info/outputGroups";
import { useOutputs } from "../models/info/outputs";
import { useParamInfos } from "../models/info/paramInfos";
import { useProject } from "../models/info/project";
import { useProjectConfig } from "../models/info/projectConfig";
import { useUITypes } from "../models/info/uiTypes";
import { updateManyParamsAndCallables } from "../state/sectionInfos/actions/sectionContents";
import { useSectionInfos } from "../state/sectionInfos/definition";
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
  useCodeInfo.getState().resetAndSetAll(codeInfo);
  if (project) {
    useProject.getState().resetAndSetAll(project);
  }
  useProjectConfig
    .getState()
    .resetAndSetAll(_.omit(projectConfig, ["viewport", "children"]));
  REACT_FLOW_STORE.initialViewport = projectConfig.viewport;
  useNodeInternals.getState().setNodes(
    _.map(projectConfig.children, (v, k) => ({
      id: k,
      position: { x: v.x, y: v.y },
      zIndex: v.zIndex,
      tempZIndex: v.zIndex,
    })),
  );
  useUITypes.getState().resetAndSetAll({ ...uiTypes, ...BASE_UI_TYPES });
  useParamInfos.getState().resetAndSetAll({ evCols, uiTypeCols });
  useParamSweep.getState().resetAndSetAll(paramSweeps);
  useRunGroups.getState().resetAndSetAll(runGroups);
  useUserCodeInfoMaps.getState().resetAndSetAll(userCodeInfoMaps);
  useProjectConfigCodeInfoMaps
    .getState()
    .resetAndSetAll(projectConfigCodeInfoMaps);
  useSectionInfos.getState().resetAndSetAll({ sections });
  useOutputs.getState().resetAndSetAll(outputs);
  useOutputGroups.getState().resetAndSetAll(outputGroups);
  updateManyParamsAndCallables(Object.keys(sections));
  maybeIncrementProjectStateVersion(true, false);
  return true;
}
