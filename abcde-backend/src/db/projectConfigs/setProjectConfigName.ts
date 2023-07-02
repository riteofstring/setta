import { prisma } from 'src/db/prisma';

export async function dbSetProjectConfigName(
  userId,
  projectId,
  currProjectConfigName,
  newProjectConfigName,
) {
  await prisma.projectConfig.update({
    where: {
      name_projectId: { name: currProjectConfigName, projectId },
      project: { ownerId: userId },
    },
    data: { name: newProjectConfigName },
  });
}
