import { prisma } from 'src/db/prisma';

export async function dbSetProjectName(
  userId,
  currProjectName,
  newProjectName,
) {
  await prisma.project.update({
    where: { name_ownerId: { name: currProjectName, ownerId: userId } },
    data: { name: newProjectName },
  });
}
