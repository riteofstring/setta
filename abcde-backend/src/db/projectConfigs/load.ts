import _ from 'lodash';
import { prisma } from 'src/db/prisma';
import { getSectionPositions } from 'src/db/sections/load';
import { getOrderedChildren } from 'src/utils/utils';

export async function getProjectConfig(id) {
  const p = await prisma.projectConfig.findUniqueOrThrow({
    where: { id },
    select: {
      id: true,
      name: true,
      sectionConfigColId: true,
      sectionConfigCol: {
        select: { children: { select: { sectionId: true, configId: true } } },
      },
      sectionChildrenId: true,
      sectionChildren: {
        select: {
          children: {
            select: { sectionId: true, order: true, x: true, y: true },
          },
        },
      },
      isDefault: true,
    },
  });
  const sectionConfigCol = _.mapValues(
    _.keyBy(p.sectionConfigCol.children, 'sectionId'),
    (v) => v.configId,
  );
  const sectionPositions = getSectionPositions(p.sectionChildren.children);

  const projectConfig = {
    id: p.id,
    name: p.name,
    sectionConfigCol: p.sectionConfigColId,
    childrenId: p.sectionChildrenId,
    children: getOrderedChildren(p.sectionChildren.children, 'sectionId'),
    isDefault: p.isDefault,
  };

  return { projectConfig, sectionConfigCol, sectionPositions };
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
