import { Prisma } from '@prisma/client';
import { ProjectConfigType } from 'abcde-utils/src/types/projectConfig';
import { ManySectionType } from 'abcde-utils/src/types/section';
import { prisma } from 'src/db/prisma';

export async function saveProjectConfig(
  projectId: string,
  config: ProjectConfigType,
  sections: ManySectionType,
) {
  const upsert: Prisma.ProjectConfigUpsertArgs['create'] = {
    id: config['id'],
    name: config['name'],
    projectId: projectId,
  };

  const update: Prisma.ProjectConfigUpdateArgs['data'] = {
    ...upsert,
    sections: {
      deleteMany: {},
      create: config.children.map((x, idx) => ({
        childId: x,
        ...sections[x].initialPosition,
      })),
    },
  };

  await prisma.$transaction([
    prisma.projectConfig.upsert({
      where: { id: upsert.id },
      create: upsert,
      update: upsert,
    }),
    prisma.projectConfig.update({
      where: { id: update.id as string },
      data: update,
    }),
  ]);
}
