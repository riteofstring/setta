import _ from "lodash";
import {
  useNodeInternals,
  useProjectState,
  useSettings,
} from "state/definitions";
import {
  route_save_as_existing_project_config,
  route_save_as_new_project_config,
  route_save_project,
} from "utils/generatedEndpoints";
import {
  ProjectStateSingleConfig,
  SettaNotificationTypeEnum,
} from "utils/generatedTypes";
import { addTemporaryNotification } from "../notifications";
import {
  createTopLevelSectionLayoutDict,
  getCurrProjectConfigViewport,
  getSectionType,
} from "../sectionInfos";
import { requestBase64FromCanvas } from "../temporaryMiscState";

export function getProjectData({
  withArtifacts = false,
  convertYamlToGUI = true,
}) {
  // remove temporary sections
  let sections = _.cloneDeep(useProjectState.getState().sections);
  // sections = _.pickBy(sections, (x) => !x.isTemporary);
  // if (convertYamlToGUI) {
  //   for (const s of Object.values(sections)) {
  //     if (s.displayMode === SECTION_DISPLAY_MODES.YAML) {
  //       yamlToGUI(s.id);
  //     }
  //   }
  // }
  // sections = _.mapValues(sections, (x) => {
  //   x.columnWidth = useSectionColumnWidth.getState()[x.id];
  //   return x;
  // });

  // const artifacts = withArtifacts ? getArtifactStateForSaving() : {};

  // const variants = _.mapValues(useProjectState.getState().variants, (x) => ({
  //   ...x,
  //   // need this filter because some sections might be temporary
  //   children: x.children.filter((c) => c in sections),
  // }));
  // const artifactGroups = useProjectState.getState().artifactGroups;

  const projectConfig = useProjectState.getState().projectConfig;
  projectConfig.viewport = getCurrProjectConfigViewport();
  projectConfig.topLevelSections = createTopLevelSectionLayoutDict(
    sections,
    useNodeInternals.getState().x,
  );

  const {
    sectionImpls,
    sectionVariants,
    codeObjs,
    codeObjImpls,
    codeObjVariants,
    singletonSections,
  } = useProjectState.getState();

  console.log(useProjectState.getState());

  const output: ProjectStateSingleConfig = {
    projectConfig,
    sections,
    sectionImpls,
    sectionVariants,
    codeObjs,
    codeObjImpls,
    codeObjVariants,
    singletonSections,
  };

  return output;
}

export async function saveProject() {
  addTemporaryNotification("Saving...", SettaNotificationTypeEnum.save);
  const data = await getProjectDataForSaving();
  route_save_project(data);
}

export async function saveAsNewProjectConfig(
  newConfigName: string,
  withRefs: boolean,
) {
  addTemporaryNotification("Saving...", SettaNotificationTypeEnum.save);
  const data = await getProjectDataForSaving();
  route_save_as_new_project_config({ project: data, newConfigName, withRefs });
}

export async function saveAsExistingProjectConfig(configName: string) {
  addTemporaryNotification("Saving...", SettaNotificationTypeEnum.save);
  const data = await getProjectDataForSaving();
  route_save_as_existing_project_config({ project: data, configName });
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
    if (
      [UITypeNameEnum.DRAW, UITypeNameEnum.CHART].includes(
        getSectionType(sectionId),
      )
    ) {
      sections[sectionId].renderedValue =
        await requestBase64FromCanvas(sectionId);
    }
  }
}
