import { getViewport } from "forks/xyflow/core/hooks/useViewportHelper";
import _ from "lodash";
import {
  dbSaveAsExistingProjectConfig,
  dbSaveAsNewProjectConfig,
  dbSaveProject,
} from "requests/projects";
import {
  useCodeInfo,
  useKeywordRegex,
  useNodeInternals,
  useParamSweep,
  useRunGroups,
  useSectionInfos,
  useSectionVariants,
  useUITypeCols,
  useUITypes,
} from "state/definitions";
import { DB_SOURCE_MAPPING } from "utils/constants";
import { getNodes } from "../nodeInternals";
import { setNotificationMessage } from "../notification";
import { getProjectConfigMetadata } from "./projectConfig";

export function getProjectData() {
  const projectConfig = getProjectConfigMetadata();
  projectConfig.viewport = getViewport();
  projectConfig.previewImgNodes = getPreviewImgNodes();
  const children = {};
  for (const c of useNodeInternals.getState().x.values()) {
    children[c.id] = { x: c.position.x, y: c.position.y, zIndex: c.zIndex };
  }
  projectConfig.children = children;

  const sectionVariants = useSectionVariants.getState().x;
  const uiTypes = useUITypes.getState().x;
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
  const fullNameToInfo = useKeywordRegex.getState().fullNameToInfo;

  const output = {
    projectConfig,
    sectionVariants,
    uiTypes,
    uiTypeCols,
    paramSweeps,
    runGroups,
    sections,
    codeInfo,
    dbSourceMapping: _.cloneDeep(DB_SOURCE_MAPPING),
    fullNameToInfo,
  };

  return output;
}

export async function saveProject() {
  setNotificationMessage("Saving...");
  const res = await dbSaveProject({ project: getProjectData() });
  if (res.status === 200) {
    setNotificationMessage("Saved!");
  }
}

export async function saveAsNewProjectConfig({ newConfigName, withRefs }) {
  return await saveProjectAs({
    fn: dbSaveAsNewProjectConfig,
    otherArgs: { newConfigName, withRefs },
  });
}

export async function saveAsExistingProjectConfig({ configName }) {
  return await saveProjectAs({
    fn: dbSaveAsExistingProjectConfig,
    otherArgs: { configName },
  });
}

async function saveProjectAs({ fn, otherArgs }) {
  await fn({ project: getProjectData(), ...otherArgs });
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
