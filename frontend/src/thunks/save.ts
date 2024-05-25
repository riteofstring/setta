import {
  dbSaveAsExistingProjectConfig,
  dbSaveAsNewProjectConfig,
  dbSaveProject,
} from "dbRequests/projects";
import _ from "lodash";
import { useProjectConfigCodeInfoMaps } from "models/codeInfoMaps/projectConfigCodeInfoMaps";
import { useCodeInfo } from "models/info/codeInfo";
import { useNodeInternals } from "models/info/nodeInternals";
import { useParamInfos } from "models/info/paramInfos";
import { useProject } from "models/info/project";
import { useProjectConfig } from "models/info/projectConfig";
import { useSectionInfos } from "models/info/sectionInfos";
import { useUITypes } from "models/info/uiTypes";
import { useNotification } from "models/notification";
import { useParamSweep } from "models/paramSweep";
import { useRunGroups } from "models/runGroups";
import ReactDOMServer from "react-dom/server";
import { DB_SOURCE_MAPPING } from "utils/constants";
import { xnor } from "utils/utils";
import { getNodesBounds } from "xyflow/core";
import { getViewport } from "xyflow/core/hooks/useViewportHelper";
import { getXYWidthHeight, MinimapSvg } from "xyflow/minimap/MiniMap";
import { ProjectSaveType } from "z_utils/types/projectSaveLoad";
import { ManySectionTypeSaveProjectToBackend } from "z_utils/types/section";
import { ManyUITypeType } from "z_utils/types/uiType";
import { isPreset } from "z_utils/uiTypeConstants";

export function getProjectData(): ProjectSaveType {
  const project = useProject.getState().getAll();
  // project.previewImg = minimapSvgToText();
  const projectConfig = useProjectConfig.getState().getAll();
  projectConfig.viewport = getViewport();
  const children = {};
  for (const c of useNodeInternals.getState().x.values()) {
    children[c.id] = { x: c.position.x, y: c.position.y, zIndex: c.zIndex };
  }
  projectConfig.children = children;

  const evCols = useParamInfos.getState().x;
  const uiTypes = assembleUITypes(useUITypes.getState().x, false);
  const uiTypeCols = useParamInfos.getState().y;
  const paramSweeps = useParamSweep.getState().x;
  const runGroups = _.mapValues(useRunGroups.getState().x, (x) => ({
    ...x,
    projectConfigId: projectConfig.id,
  }));

  const sectionInfosState = useSectionInfos.getState();
  const sections: ManySectionTypeSaveProjectToBackend = _.mapValues(
    sectionInfosState.x,
    (x) => _.omit(x, ["parentId"]),
  );

  const codeInfo = useCodeInfo.getState().x;

  const projectConfigCodeInfoMaps = useProjectConfigCodeInfoMaps
    .getState()
    .exportForDb();

  const output = {
    project,
    projectConfig,
    evCols,
    uiTypes,
    uiTypeCols,
    paramSweeps,
    runGroups,
    sections,
    codeInfo,
    projectConfigCodeInfoMaps,
    dbSourceMapping: DB_SOURCE_MAPPING,
  };
  // console.log(output);

  return output;
}

export async function saveProject() {
  const n = useNotification.getState();
  n.setMessage("Saving...");
  const x = assembleProject();
  const res = await dbSaveProject(x);
  if (res.status === 200) {
    n.setMessage("Saved!");
  }
}

export async function saveAsNewProjectConfig({ newConfigName }) {
  return await saveProjectAs({
    fn: dbSaveAsNewProjectConfig,
    otherArgs: { newConfigName },
  });
}

export async function saveAsExistingProjectConfig({ configName }) {
  return await saveProjectAs({
    fn: dbSaveAsExistingProjectConfig,
    otherArgs: { configName },
  });
}

async function saveProjectAs({ fn, otherArgs }) {
  const x = assembleProject();
  await fn({ ...x, ...otherArgs });
}

function assembleProject() {
  return { project: getProjectData() };
}

export function assembleUITypes(
  s: ManyUITypeType,
  _isPreset: boolean,
): ManyUITypeType {
  return _.pickBy(s, (v) => xnor(_isPreset, isPreset(v)));
}

