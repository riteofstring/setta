import { Prisma } from '@prisma/client';
import { ProjectConfigType } from 'abcde-utils/src/types/projectConfig';
import { ManySectionType } from 'abcde-utils/src/types/section';
import { prisma } from 'src/db/prisma';

export async function saveProjectConfig(
  projectId: string,
  config: ProjectConfigType,
  sections: ManySectionType,
) {
  const create: Prisma.ProjectConfigUpsertArgs['create'] = {
    id: config['id'],
    name: config['name'],
    projectId: projectId,
    sections: {
      create: config.children.map((x, idx) => ({
        childId: x,
        ...sections[x].initialPosition,
      })),
    },
  };

  const update: Prisma.ProjectConfigUpdateArgs['data'] = {
    ...create,
    sections: {
      deleteMany: {},
      ...create.sections,
    },
  };

  await prisma.projectConfig.upsert({
    where: { id: create.id },
    create,
    update,
  });
}
