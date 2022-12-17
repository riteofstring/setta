import { prisma } from 'src/prisma';
import { copyProjectDetails } from 'src/projects/copy';
import { saveProjectDetails } from 'src/projects/save';
import { renameKeys } from 'src/utils/utils';
import { copyProjectConfig } from './copy';

export async function saveAsNewProjectConfig(
  user,
  project,
  newConfigName: string,
) {
  const projectToSave = copyProjectDetails(project);
  projectToSave.projectConfig = copyProjectConfig({
    projectConfig: projectToSave.projectConfig,
    newConfigName,
  });
  await saveProjectDetails(prisma, user, projectToSave);
  return projectToSave;
}

export async function saveAsExistingProjectConfig(
  user,
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
  await saveProjectDetails(prisma, user, projectToSave);
  return projectToSave;
}
