import _ from 'lodash';
import { prisma } from 'src/db/prisma';
import { getSectionPositions } from 'src/db/sections/load';
import { getOrderedChildren, renameKeys } from 'src/utils/utils';

export async function getProjectConfig(id) {
  let p = await prisma.projectConfig.findUniqueOrThrow({
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
  const sectionPositions = getSectionPositions(p.sectionChildren.children);

  p['children'] = getOrderedChildren(p.sectionChildren.children, 'sectionId');

  p = renameKeys(p, {
    sectionConfigColId: 'sectionConfigCol',
    sectionChildrenId: 'childrenId',
  });

  const projectConfig = _.pick(p, [
    'id',
    'name',
    'sectionConfigCol',
    'childrenId',
    'children',
  ]);

  return { projectConfig, sectionConfigCol, sectionPositions };
}
