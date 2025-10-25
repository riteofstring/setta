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
import { flushQueuedArtifacts } from "../artifacts";
import { addTemporaryNotification } from "../notifications";
import {
  createTopLevelSectionLayoutDict,
  getCurrProjectConfigViewport,
} from "../sectionInfos";

export function getProjectData() {
  // remove temporary sections
  let sections = _.cloneDeep(useProjectState.getState().sections);

  const projectConfig = _.cloneDeep(useProjectState.getState().projectConfig);
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
  await flushQueuedArtifacts();
  const data = await getProjectDataForSaving();
  route_save_project({ projectConfigId: data.projectConfig.id });
}

export async function saveAsNewProjectConfig(
  newConfigName: string,
  withRefs: boolean,
) {
  addTemporaryNotification("Saving...", SettaNotificationTypeEnum.save);
  await flushQueuedArtifacts();
  const data = await getProjectDataForSaving();
  route_save_as_new_project_config({
    projectConfigId: data.projectConfig.id,
    newConfigName,
    withRefs,
  });
}

export async function saveAsExistingProjectConfig(configName: string) {
  addTemporaryNotification("Saving...", SettaNotificationTypeEnum.save);
  await flushQueuedArtifacts();
  const data = await getProjectDataForSaving();
  route_save_as_existing_project_config({
    projectConfigId: data.projectConfig.id,
    configName,
  });
}

export async function getProjectDataForSaving() {
  const project = getProjectData();

  if (useSettings.getState().backend.saveRenderedValues) {
    await updateSectionsWithRenderedValues(project.sections);
  }

  return project;
}

async function updateSectionsWithRenderedValues(sections) {
  // TODO
}
