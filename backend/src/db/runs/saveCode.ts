import { prisma } from 'src/db/prisma';

export async function saveGeneratedCode({
  id,
  ownerId,
  projectConfigId,
  code,
}) {
  return await prisma.run.create({
    data: {
      id,
      name: id,
      owner: { connect: { id: ownerId } },
      projectConfig: { connect: { id: projectConfigId } },
      code,
    },
  });
}
