import { getViewport } from "forks/xyflow/core/hooks/useViewportHelper";
import { useReactFlow } from "forks/xyflow/core/store";
import _ from "lodash";
import {
  dbSaveAsExistingProjectConfig,
  dbSaveAsNewProjectConfig,
  dbSaveProject,
} from "requests/projects";
import { dbSaveSettings } from "requests/settings";
import {
  useArtifacts,
  useKeywordRegex,
  useNodeInternals,
  useProjectConfig,
  useSectionInfos,
  useSettings,
} from "state/definitions";
import { SECTION_DISPLAY_MODES, SETTINGS_PROJECT_NAME } from "utils/constants";
import { yamlToGUI } from "../guiToYaml";
import { setNotificationMessage } from "../notification";

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
      type: artifactState[a].type,
      displayName: artifactState[a].displayName,
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

  const codeInfo = useSectionInfos.getState().codeInfo;
  const codeInfoCols = useSectionInfos.getState().codeInfoCols;
  const fullNameToInfo = useKeywordRegex.getState().fullNameToInfo;

  const projectConfig = getProjectConfigMetadata();
  const children = {};
  for (const c of useNodeInternals.getState().x.values()) {
    if (c.id in sections) {
      // need this filter because some sections might be temporary
      children[c.id] = {
        x: c.position.x,
        y: c.position.y,
        zIndex: c.zIndex,
        w: c.width, // save width and height so we can show preview on home page
        h: c.height,
      };
    }
  }
  projectConfig.children = children;
  console.log("projectConfig", projectConfig);

  const output = {
    projectConfig,
    sectionVariants,
    uiTypes,
    uiTypeCols,
    sections,
    codeInfo,
    codeInfoCols,
    fullNameToInfo,
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

function getProjectConfigMetadata() {
  const state = useProjectConfig.getState();
  const output = {
    id: state.id,
    name: state.name,
    isDefault: state.isDefault,
    previewImgColor: state.previewImgColor,
  };

  output.viewport = useReactFlow.getState().fitViewOnInit
    ? null
    : getViewport();

  return output;
}
