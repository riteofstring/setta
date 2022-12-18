import { PrismaClient } from '@prisma/client';
import * as _ from 'lodash';
import { getSectionPositions } from 'src/sections/load';
import { getOrderedChildren, renameKeys } from 'src/utils/utils';

export async function getProjectConfig(prisma: PrismaClient, id) {
  const p = await prisma.projectConfig.findUnique({
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
    },
  });
  const sectionConfigCol = _.mapValues(
    _.keyBy(p.sectionConfigCol.children, 'sectionId'),
    (v) => v.configId,
  );
  delete p.sectionConfigCol;

  p['children'] = getOrderedChildren(p.sectionChildren.children, 'sectionId');
  const sectionPositions = getSectionPositions(p.sectionChildren.children);
  delete p.sectionChildren;
  const projectConfig = renameKeys(p, {
    sectionConfigColId: 'sectionConfigCol',
    sectionChildrenId: 'childrenId',
  });

  return { projectConfig, sectionConfigCol, sectionPositions };
}
