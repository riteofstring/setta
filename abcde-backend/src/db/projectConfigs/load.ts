import { ProjectConfigType } from 'abcde-utils/src/types/projectConfig';
import _ from 'lodash';
import { prisma } from 'src/db/prisma';

export async function getProjectConfig(id) {
  const p = await prisma.projectConfig.findUniqueOrThrow({
    where: { id },
    include: {
      sections: {
        select: { childId: true, x: true, y: true, zIndex: true },
      },
    },
  });

  const projectConfig: ProjectConfigType = {
    id: p.id,
    name: p.name,
    children: _.mapValues(_.keyBy(p.sections, 'childId'), (x) =>
      _.omit(x, 'childId'),
    ),
    viewport: { x: p.x, y: p.y, zoom: p.zoom },
  };

  return projectConfig;
}

export async function getPathnameFromProjectConfigId(id) {
  const info = await prisma.projectConfig.findFirstOrThrow({
    where: { id },
    select: {
      name: true,
      project: { select: { name: true, owner: { select: { name: true } } } },
    },
  });

  return `/${info.project.owner.name}/${info.project.name}/${info.name}`;
}
