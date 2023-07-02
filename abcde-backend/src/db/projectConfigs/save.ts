import { Prisma } from '@prisma/client';
import { ProjectConfigType } from 'abcde-utils/src/types/projectConfig';
import _ from 'lodash';
import { prisma } from 'src/db/prisma';
import { deleteManyFirst } from 'src/utils/utils';

export async function saveProjectConfig(
  projectId: string,
  config: ProjectConfigType,
) {
  const create: Prisma.ProjectConfigUpsertArgs['create'] = {
    id: config['id'],
    name: config['name'],
    projectId: projectId,
    sections: {
      create: _.map(config.children, (v, k) => ({
        childId: k,
        ...v,
      })),
    },
    ...config.viewport,
  };

  await prisma.projectConfig.upsert({
    where: { id: create.id },
    create,
    update: deleteManyFirst(create, 'sections'),
  });
}
