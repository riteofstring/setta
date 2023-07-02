import { ProjectSaveType } from 'abcde-utils/src/types/projectSaveLoad';
import { prisma } from 'src/db/prisma';
import { copyProjectDetails } from 'src/db/projects/copy';
import { saveProjectDetails } from 'src/db/projects/save';

export async function saveAsNewProjectConfig(
  userId: string,
  project: ProjectSaveType,
  newConfigName: string,
) {
  const projectToSave = copyProjectDetails({
    project,
    newConfigName,
    doCreateNewId: true,
  });
  await saveProjectDetails(userId, projectToSave);
  return projectToSave;
}

export async function saveAsExistingProjectConfig(
  userId: string,
  project: ProjectSaveType,
  configName: string,
) {
  const x = await prisma.projectConfig.findUniqueOrThrow({
    where: {
      name_projectId: { name: configName, projectId: project.project.id },
    },
  });

  project.projectConfig = {
    ...project.projectConfig,
    id: x.id,
    name: x.name,
  };

  const projectToSave = copyProjectDetails({ project });
  await saveProjectDetails(userId, projectToSave);
  return projectToSave;
}
