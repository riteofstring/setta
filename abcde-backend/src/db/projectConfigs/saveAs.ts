import { ProjectSaveType } from 'abcde-utils/src/types/projectSaveLoad';
import { prisma } from 'src/db/prisma';
import { copyProjectDetails } from 'src/db/projects/copy';
import { saveProjectDetails } from 'src/db/projects/save';
import { copyProjectConfig } from './copy';

export async function saveAsNewProjectConfig(
  userId: string,
  project: ProjectSaveType,
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
  userId: string,
  project: ProjectSaveType,
  configId: string,
) {
  const projectToSave = copyProjectDetails(project);
  const x = await prisma.projectConfig.findUniqueOrThrow({
    where: { id: configId },
  });

  const existingProjectConfig = {
    id: x.id,
    name: x.name,
    children: projectToSave.projectConfig.children,
    isDefault: projectToSave.projectConfig.isDefault,
  };

  projectToSave.projectConfig = copyProjectConfig({
    projectConfig: existingProjectConfig,
    doCreateNewId: false,
  });
  await saveProjectDetails(userId, projectToSave);
  return projectToSave;
}
