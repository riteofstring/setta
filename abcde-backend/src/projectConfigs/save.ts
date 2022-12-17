import { PrismaClient } from '@prisma/client';
import * as _ from 'lodash';
import { saveSectionChildren } from 'src/sections/save';

async function assembleProjectConfig(prisma: PrismaClient, config, sections) {
  const { id, name, sectionConfigCol, children, childrenId } = config;
  const sectionPositions = _.mapValues(sections, (x) => x.initialPosition);
  await prisma.sectionChildrenId.createMany({
    data: [{ id: childrenId }],
    skipDuplicates: true,
  });
  await saveSectionChildren(
    prisma,
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

export async function saveProjectConfig(
  prisma: PrismaClient,
  config,
  sections,
) {
  const data = await assembleProjectConfig(prisma, config, sections);
  await prisma.projectConfig.upsert({
    where: { id: data.id },
    create: data,
    update: data,
  });
}
