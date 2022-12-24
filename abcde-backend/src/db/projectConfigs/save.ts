import { ProjectConfigType } from 'abcde-utils/src/types/projectConfig';
import * as _ from 'lodash';
import { prisma } from 'src/db/prisma';
import { saveSectionChildren } from 'src/db/sections/save';

async function assembleProjectConfig(config, sections) {
  const { id, name, sectionConfigCol, children, childrenId } = config;
  const sectionPositions = _.mapValues(sections, (x) => x.initialPosition);
  await prisma.sectionChildrenId.createMany({
    data: [{ id: childrenId }],
    skipDuplicates: true,
  });
  await saveSectionChildren(
    { null: children },
    { null: childrenId },
    { null: sectionPositions },
  );

  return {
    id,
    name,
    sectionConfigColId: sectionConfigCol,
    sectionChildrenId: childrenId,
  };
}

export async function saveProjectConfig(config: ProjectConfigType, sections) {
  const data = await assembleProjectConfig(config, sections);
  await prisma.projectConfig.upsert({
    where: { id: data.id },
    create: data,
    update: data,
  });
}
