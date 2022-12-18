import { prisma } from 'src/db/prisma';
import { copyProjectDetails } from 'src/db/projects/copy';
import { saveProjectDetails } from 'src/db/projects/save';
import { renameKeys } from 'src/utils/utils';
import { copyProjectConfig } from './copy';

export async function saveAsNewProjectConfig(
  userId,
  project,
  newConfigName: string,
) {
  const projectToSave = copyProjectDetails(project);
  projectToSave.projectConfig = copyProjectConfig({
    projectConfig: projectToSave.projectConfig,
    newConfigName,
  });
  await saveProjectDetails(userId, projectToSave);
  return projectToSave;
}

export async function saveAsExistingProjectConfig(
  userId,
  project,
  configId: string,
) {
  const projectToSave = copyProjectDetails(project);
  let existingProjectConfig = await prisma.projectConfig.findUnique({
    where: { id: configId },
  });
  existingProjectConfig = renameKeys(existingProjectConfig, {
    sectionConfigColId: 'sectionConfigCol',
    sectionChildrenId: 'childrenId',
  });
  existingProjectConfig['children'] = projectToSave.projectConfig.children;
  delete existingProjectConfig.projectId;
  projectToSave.projectConfig = copyProjectConfig({
    projectConfig: existingProjectConfig,
    doCreateNewId: false,
  });
  await saveProjectDetails(userId, projectToSave);
  return projectToSave;
}
