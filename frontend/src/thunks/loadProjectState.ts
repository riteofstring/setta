import _ from "lodash";
import { useNodeInternals } from "models/info/nodeInternals";
import { usePanes } from "models/panes";
import { useParamSweep } from "models/paramSweep";
import { useRunGroups } from "models/runGroups";
import { REACT_FLOW_STORE } from "utils/constants";
import { ProjectLoadType } from "z_utils/types/projectSaveLoad";
import { useProjectConfigCodeInfoMaps } from "../models/codeInfoMaps/projectConfigCodeInfoMaps";
import { useUserCodeInfoMaps } from "../models/codeInfoMaps/userCodeInfoMaps";
import { useCodeInfo } from "../models/info/codeInfo";
import { useOutputGroups } from "../models/info/outputGroups";
import { useOutputs } from "../models/info/outputs";
import { useParamInfos } from "../models/info/paramInfos";
import { useProject } from "../models/info/project";
import { useProjectConfig } from "../models/info/projectConfig";
import { useSectionInfos } from "../models/info/sectionInfos";
import { useUITypes } from "../models/info/uiTypes";
import { updateManyParamsAndCallables } from "./sections/sectionContents";
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
}: ProjectLoadType) {
  useCodeInfo.getState().resetAndSetAll(codeInfo);
  if (project) {
    useProject.getState().resetAndSetAll(project);
  }
  useProjectConfig
    .getState()
    .resetAndSetAll(_.omit(projectConfig, ["viewport", "children"]));
  usePanes.getState().setAll(projectConfig.panes);
  REACT_FLOW_STORE.initialViewport = projectConfig.viewport;
  useNodeInternals.getState().setNodes(
    _.map(projectConfig.children, (v, k) => ({
      id: k,
      position: { x: v.x, y: v.y },
      zIndex: v.zIndex,
      tempZIndex: v.zIndex,
    })),
  );
  useUITypes.getState().resetAndSetAll(uiTypes);
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
