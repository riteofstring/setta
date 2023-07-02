import { prisma } from 'src/db/prisma';
import { getSectionPositions } from 'src/db/sections/load';
import { getOrderedChildren } from 'src/utils/utils';

export async function getProjectConfig(id) {
  const p = await prisma.projectConfig.findUniqueOrThrow({
    where: { id },
    select: {
      id: true,
      name: true,
      sections: {
        select: { childId: true, order: true, x: true, y: true },
      },
    },
  });

  const sectionPositions = getSectionPositions(p.sections);

  const projectConfig = {
    id: p.id,
    name: p.name,
    children: getOrderedChildren(p.sections, 'childId'),
  };

  return { projectConfig, sectionPositions };
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
