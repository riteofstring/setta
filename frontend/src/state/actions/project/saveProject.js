import _ from "lodash";
import {
  dbSaveAsExistingProjectConfig,
  dbSaveAsNewProjectConfig,
  dbSaveProject,
} from "requests/projects";
import { dbSaveSettings } from "requests/settings";
import {
  useArtifacts,
  useCodeInfo,
  useKeywordRegex,
  useNodeInternals,
  useParamSweep,
  useProjectConfig,
  useRunGroups,
  useSectionInfos,
  useSettings,
} from "state/definitions";
import { SECTION_DISPLAY_MODES, SETTINGS_PROJECT_NAME } from "utils/constants";
import { yamlToGUI } from "../guiToYaml";
import { getNodes } from "../nodeInternals";
import { setNotificationMessage } from "../notification";
import { getProjectConfigMetadata } from "./projectConfig";

export function getProjectData({
  withArtifactMetadata = false,
  convertYamlToGUI = false,
}) {
  // remove temporary sections
  let sections = _.pickBy(useSectionInfos.getState().x, (x) => !x.isTemporary);
  if (convertYamlToGUI) {
    for (const s of Object.values(sections)) {
      if (s.displayMode === SECTION_DISPLAY_MODES.YAML) {
        yamlToGUI(s.id);
      }
    }
  }

  sections = _.mapValues(sections, (x) => {
    const artifactState = useArtifacts.getState().x;
    if (!withArtifactMetadata) {
      return _.omit(x, ["artifacts"]);
    }
    const currSection = _.cloneDeep(x);
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

  console.log("sections", sections);

  const sectionVariants = _.mapValues(
    useSectionInfos.getState().variants,
    (x) => ({
      ...x,
      // need this filter because some sections might be temporary
      children: x.children.filter((c) => c in sections),
    }),
  );
  const uiTypes = useSectionInfos.getState().uiTypes;
  const uiTypeCols = useSectionInfos.getState().uiTypeCols;
  const paramSweeps = useParamSweep.getState().x;
  const runGroups = useRunGroups.getState().x;

  const codeInfo = useCodeInfo.getState().x;
  const codeInfoCols = useSectionInfos.getState().codeInfoCols;
  const fullNameToInfo = useKeywordRegex.getState().fullNameToInfo;

  const projectConfig = getProjectConfigMetadata();
  projectConfig.previewImgNodes = getPreviewImgNodes();
  const children = {};
  for (const c of useNodeInternals.getState().x.values()) {
    if (c.id in sections) {
      // need this filter because some sections might be temporary
      children[c.id] = { x: c.position.x, y: c.position.y, zIndex: c.zIndex };
    }
  }
  projectConfig.children = children;

  const output = {
    projectConfig,
    sectionVariants,
    uiTypes,
    uiTypeCols,
    paramSweeps,
    runGroups,
    sections,
    codeInfo,
    codeInfoCols,
    fullNameToInfo,
    jsonSourceMissing: {},
  };

  // console.log(output);

  return output;
}

export async function saveProject() {
  let res;
  setNotificationMessage("Saving...");
  if (useProjectConfig.getState().name === SETTINGS_PROJECT_NAME) {
    res = await dbSaveSettings(getProjectData({ convertYamlToGUI: true }));
    if (res.status === 200) {
      useSettings.setState(res.data);
    }
  } else {
    res = await dbSaveProject({
      project: getProjectData({
        withArtifactMetadata: true,
        convertYamlToGUI: true,
      }),
    });
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
    project: getProjectData({
      withArtifactMetadata: true,
      convertYamlToGUI: true,
    }),
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
