import { getViewport } from "forks/xyflow/core/hooks/useViewportHelper";
import _ from "lodash";
import {
  dbSaveAsExistingProjectConfig,
  dbSaveAsNewProjectConfig,
  dbSaveProject,
} from "requests/projects";
import {
  useArtifacts,
  useCodeInfo,
  useKeywordRegex,
  useNodeInternals,
  useParamSweep,
  useProjectConfig,
  useRunGroups,
  useSectionInfos,
  useSectionVariants,
  useUITypeCols,
  useUITypes,
} from "state/definitions";
import { SETTINGS_PROJECT_NAME } from "utils/constants";
import { getNodes } from "../nodeInternals";
import { setNotificationMessage } from "../notification";
import { loadSettings } from "../settings";
import { getProjectConfigMetadata } from "./projectConfig";

export function getProjectData({ withArtifactMetadata = false }) {
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
  const runGroups = useRunGroups.getState().x;

  const sectionInfosState = useSectionInfos.getState();
  const sections = _.mapValues(sectionInfosState.x, (x) => {
    const artifactState = useArtifacts.getState().x;
    if (!withArtifactMetadata) {
      return _.omit(x, ["parentId", "artifacts"]);
    }
    const currSection = _.omit(x, ["parentId"]);
    // keep only artifact paths that are actually saved to disk
    currSection.artifacts = currSection.artifacts.filter(
      (a) => artifactState[a].isSaved,
    );
    currSection.artifacts = currSection.artifacts.map((a) => ({
      path: a,
      value: a.startsWith("data:") ? artifactState[a].value : undefined,
      ..._.pick(artifactState[a], ["type", "displayName"]),
    }));
    return currSection;
  });

  const codeInfo = useCodeInfo.getState().x;
  const fullNameToInfo = useKeywordRegex.getState().fullNameToInfo;
  console.log("fullNameToInfo", fullNameToInfo);

  const output = {
    projectConfig,
    sectionVariants,
    uiTypes,
    uiTypeCols,
    paramSweeps,
    runGroups,
    sections,
    codeInfo,
    fullNameToInfo,
  };

  console.log(Object.values(paramSweeps));

  return output;
}

export async function saveProject() {
  setNotificationMessage("Saving...");
  const res = await dbSaveProject({
    project: getProjectData({ withArtifactMetadata: true }),
  });
  if (useProjectConfig.getState().name === SETTINGS_PROJECT_NAME) {
    await loadSettings();
  }
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
  await fn({
    project: getProjectData({ withArtifactMetadata: true }),
    ...otherArgs,
  });
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
