import { getViewport } from "forks/xyflow/core/hooks/useViewportHelper";
import _ from "lodash";
import {
  dbSaveAsExistingProjectConfig,
  dbSaveAsNewProjectConfig,
  dbSaveProject,
} from "requests/projects";
import { useCodeInfo } from "state/definitions/codeInfo";
import { useEVCols } from "state/definitions/evCols";
import { useNodeInternals } from "state/definitions/nodeInternals";
import { useParamSweep } from "state/definitions/paramSweep";
import { useRunGroups } from "state/definitions/runGroups";
import { useSectionInfos } from "state/definitions/sectionInfos";
import { useUITypeCols } from "state/definitions/uiTypeCols";
import { useUITypes } from "state/definitions/uiTypes";
import { DB_SOURCE_MAPPING } from "utils/constants";
import { isPreset } from "utils/sectionTypeHelpers";
import { xnor } from "utils/utils";
import { getNodes } from "./nodeInternals";
import { setNotificationMessage } from "./notification";
import { getProjectMetadata } from "./project";
import { getProjectConfigMetadata } from "./projectConfig";

export function getProjectData() {
  const project = getProjectMetadata();
  project.previewImgNodes = getPreviewImgNodes();
  const projectConfig = getProjectConfigMetadata();
  projectConfig.viewport = getViewport();
  const children = {};
  for (const c of useNodeInternals.getState().x.values()) {
    children[c.id] = { x: c.position.x, y: c.position.y, zIndex: c.zIndex };
  }
  projectConfig.children = children;

  const evCols = useEVCols.getState().x;
  const uiTypes = assembleUITypes(useUITypes.getState().x, false);
  const uiTypeCols = useUITypeCols.getState().y;
  const paramSweeps = useParamSweep.getState().x;
  const runGroups = _.mapValues(useRunGroups.getState().x, (x) => ({
    ...x,
    projectConfigId: projectConfig.id,
  }));

  const sectionInfosState = useSectionInfos.getState();
  const sections = _.mapValues(sectionInfosState.x, (x) =>
    _.omit(x, ["parentId"]),
  );

  const codeInfo = useCodeInfo.getState().x;

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
    dbSourceMapping: DB_SOURCE_MAPPING,
  };
  // console.log(output);

  return output;
}

export async function saveProject() {
  setNotificationMessage("Saving...");
  const x = assembleProject();
  const res = await dbSaveProject(x);
  if (res.status === 200) {
    setNotificationMessage("Saved!");
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

export function assembleUITypes(s, _isPreset) {
  return _.pickBy(s, (v) => xnor(_isPreset, isPreset(v)));
}

function getPreviewImgNodes() {
  const nodes = getNodes().map((n) => ({
    x: Math.round(n.position.x),
    y: Math.round(n.position.y),
    w: Math.round(n.width),
    h: Math.round(n.height),
  }));

  return JSON.stringify(nodes);
}
