import { PrismaClient } from '@prisma/client';
import _ = require('lodash');
import { deleteThenCreateCol, prismaNullOrConnect } from '../utils/utils';

export async function saveSections(
  prisma: PrismaClient,
  sections,
  sectionChildren,
) {
  await prisma.sectionChildrenId.createMany({
    data: _.values(sections).map((x) => ({ id: x.sectionChildrenId })),
    skipDuplicates: true,
  });

  const inDbFormat = [];
  for (const v of _.values(sections)) {
    const curr = {
      id: v.id,
      name: v.name,
      children: { connect: { id: v.sectionChildrenId } },
    };
    curr['paramInfo'] = prismaNullOrConnect(v.paramInfoId);
    inDbFormat.push(curr);
  }

  await prisma.$transaction(
    inDbFormat.map((v) =>
      prisma.section.upsert({
        where: { id: v.id },
        create: v,
        update: v,
      }),
    ),
  );

  await saveSectionChildren(
    prisma,
    sectionChildren,
    _.mapValues(sections, (v) => v.sectionChildrenId),
  );
}

export async function saveSectionChildren(
  prisma: PrismaClient,
  sectionChildren,
  sectionChildrenIds,
) {
  const inDbFormat = [];

  for (const parentSectionId of _.keys(sectionChildren)) {
    let order = 0;
    for (const sectionId of sectionChildren[parentSectionId]) {
      inDbFormat.push({
        idid: sectionChildrenIds[parentSectionId],
        sectionId,
        order,
      });
      order += 1;
    }
  }
  deleteThenCreateCol(prisma, prisma.sectionChildren, inDbFormat);
}

export async function saveSectionConfigs(prisma: PrismaClient, sectionConfigs) {
  const inDbFormat = [];
  for (const v of _.values(sectionConfigs)) {
    const curr = {
      id: v.id,
      evColId: v.evColId,
      kwargColId: v.kwargColId,
      selectedItemId: v.selectedItem,
      uiTypeId: v.uiTypeId,
    };
    inDbFormat.push(curr);
  }
  await prisma.$transaction(
    inDbFormat.map((v) =>
      prisma.sectionConfig.upsert({
        where: { id: v.id },
        create: v,
        update: v,
      }),
    ),
  );
}

export async function saveSectionConfigCol(
  prisma: PrismaClient,
  sectionConfigCol,
  colId,
) {
  await prisma.sectionConfigColId.createMany({
    data: [{ id: colId }],
    skipDuplicates: true,
  });

  const inDbFormat = [];
  for (const sectionId of _.keys(sectionConfigCol)) {
    inDbFormat.push({
      idid: colId,
      sectionId,
      configId: sectionConfigCol[sectionId],
    });
  }
  deleteThenCreateCol(prisma, prisma.sectionConfigCol, inDbFormat);
}
