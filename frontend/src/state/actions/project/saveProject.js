import C from "constants/constants.json";
import { getViewport } from "forks/xyflow/core/hooks/useViewportHelper";
import { useReactFlow } from "forks/xyflow/core/store";
import _ from "lodash";
import {
  dbSaveAsExistingProjectConfig,
  dbSaveAsNewProjectConfig,
  dbSaveProject,
} from "requests/projects";
import { dbSaveSettingsProject } from "requests/settings";
import {
  useNodeInternals,
  useProjectState,
  useSectionColumnWidth,
  useSettings,
} from "state/definitions";
import { SECTION_DISPLAY_MODES, SETTINGS_PROJECT_NAME } from "utils/constants";
import { getArtifactStateForSaving } from "../artifacts";
import { yamlToGUI } from "../guiToYaml";
import { addTemporaryNotification } from "../notifications";
import { getSectionType } from "../sectionInfos";
import { requestBase64FromCanvas } from "../temporaryMiscState";

export function getProjectData({
  withArtifacts = false,
  convertYamlToGUI = true,
}) {
  // remove temporary sections
  let sections = _.cloneDeep(useProjectState.getState().sections);
  sections = _.pickBy(sections, (x) => !x.isTemporary);
  if (convertYamlToGUI) {
    for (const s of Object.values(sections)) {
      if (s.displayMode === SECTION_DISPLAY_MODES.YAML) {
        yamlToGUI(s.id);
      }
    }
  }
  sections = _.mapValues(sections, (x) => {
    x.columnWidth = useSectionColumnWidth.getState()[x.id];
    return x;
  });

  const artifacts = withArtifacts ? getArtifactStateForSaving() : {};

  const variants = _.mapValues(
    useProjectState.getState().variants,
    (x) => ({
      ...x,
      // need this filter because some sections might be temporary
      children: x.children.filter((c) => c in sections),
    }),
  );
  const artifactGroups = useProjectState.getState().artifactGroups;
  const uiTypes = _.pickBy(
    useProjectState.getState().uiTypes,
    (u) => u.presetType !== C.PRESET_UI_TYPE_BASE,
  );
  const uiTypeCols = useProjectState.getState().uiTypeCols;

  const codeInfo = useProjectState.getState().codeInfo;
  const codeInfoCols = useProjectState.getState().codeInfoCols;

  const { projectConfigId, projectConfigs } = getProjectConfigMetadata();
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
  projectConfigs[projectConfigId].children = children;

  const output = {
    projectConfigs,
    variants,
    artifacts,
    artifactGroups,
    uiTypes,
    uiTypeCols,
    sections,
    codeInfo,
    codeInfoCols,
  };

  return output;
}

export async function saveProject() {
  addTemporaryNotification("Saving...", C.NOTIFICATION_TYPE_SAVE);

  if (useProjectState.getState().projectConfig.name === SETTINGS_PROJECT_NAME) {
    const res = await dbSaveSettingsProject(getProjectData({}));
    if (res.status === 200) {
      useSettings.setState(res.data);
    }
  } else {
    dbSaveProject({
      project: await getProjectDataForSaving(),
    });
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
    project: await getProjectDataForSaving(),
    ...otherArgs,
  });
}

function getProjectConfigMetadata() {
  const s = useProjectState.getState();
  const projectConfigs = _.cloneDeep(s.projectConfigs);

  projectConfigs[s.projectConfigId].viewport = useReactFlow.getState()
    .fitViewOnInit
    ? null
    : getViewport();

  return { projectConfigId: s.projectConfigId, projectConfigs };
}

export async function getProjectDataForSaving() {
  const project = getProjectData({
    withArtifacts: true,
    convertYamlToGUI: true,
  });

  if (useSettings.getState().backend.saveRenderedValues) {
    await updateSectionsWithRenderedValues(project["sections"]);
  }

  return project;
}

async function updateSectionsWithRenderedValues(sections) {
  for (const sectionId of Object.keys(sections)) {
    if ([C.DRAW, C.CHART].includes(getSectionType(sectionId))) {
      sections[sectionId].renderedValue =
        await requestBase64FromCanvas(sectionId);
    }
  }
}

/**
 * Get the currently viewed project config id
 * @SETTA_MCP_TOOL
 * @return {ID} The project config id.
 */
export function getProjectConfigId() {
  return useProjectState.getState().projectConfig.id;
}
