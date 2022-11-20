import { PrismaClient } from '@prisma/client';
import {
  connectOrCreateColId,
  createIdMap,
  deleteThenCreateCol,
  prismaNullOrConnect,
} from 'src/utils/utils';
import _ = require('lodash');

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
  sectionPositions = {},
) {
  const allColIds = _.values(sectionChildrenIds);
  const inDbFormat = [];
  for (const parentSectionId of _.keys(sectionChildren)) {
    let order = 0;
    for (const sectionId of sectionChildren[parentSectionId]) {
      const position = sectionPositions[parentSectionId]?.[sectionId];
      inDbFormat.push({
        idid: sectionChildrenIds[parentSectionId],
        sectionId,
        order,
        x: position?.x,
        y: position?.y,
      });
      order += 1;
    }
  }
  deleteThenCreateCol(prisma, prisma.sectionChildren, allColIds, inDbFormat);
}

function assembleSectionConfig(sectionConfigs) {
  const inDbFormat = [];
  for (const v of _.values(sectionConfigs)) {
    const curr = {
      id: v.id,
      evCol: connectOrCreateColId(v.evColId),
      kwargCol: connectOrCreateColId(v.kwargColId),
      selectedItem: prismaNullOrConnect(v.selectedItem),
      uiType: prismaNullOrConnect(v.uiTypeId),
    };
    inDbFormat.push(curr);
  }
  return inDbFormat;
}

export async function saveSectionConfigs(prisma: PrismaClient, sectionConfigs) {
  const inDbFormat = assembleSectionConfig(sectionConfigs);

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

export async function copySectionConfigs(
  prisma: PrismaClient,
  sectionConfigs,
  evColIdIdMap,
) {
  const withReplacedEVColIds = _.mapValues(sectionConfigs, (x) => {
    const newX = { ...x };
    const curr = newX['evColId'];
    if (curr in evColIdIdMap) {
      newX['evColId'] = evColIdIdMap[curr];
    }
    return newX;
  });

  const inDbFormat = assembleSectionConfig(withReplacedEVColIds);
  const withoutId = inDbFormat.map((x) => {
    const { id, ...newX } = x;
    return newX;
  });

  const newSectionConfigs = await prisma.$transaction(
    withoutId.map((x) => prisma.sectionConfig.create({ data: x })),
  );
  return createIdMap(inDbFormat, newSectionConfigs);
}

function assembleSectionConfigCol(sectionConfigCol, colId) {
  const inDbFormat = [];
  for (const sectionId of _.keys(sectionConfigCol)) {
    inDbFormat.push({
      idid: colId,
      sectionId,
      configId: sectionConfigCol[sectionId],
    });
  }
  return inDbFormat;
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

  const inDbFormat = assembleSectionConfigCol(sectionConfigCol, colId);
  deleteThenCreateCol(prisma, prisma.sectionConfigCol, [colId], inDbFormat);
}

export async function copySectionConfigCol(
  prisma: PrismaClient,
  sectionConfigCol,
  sectionConfigIdMap,
) {
  const newIdObj = await prisma.sectionConfigColId.create({ data: {} });
  const newId = newIdObj['id'];
  const newSectionConfigCol = { ...sectionConfigCol };

  for (const sectionId of _.keys(newSectionConfigCol)) {
    const curr = newSectionConfigCol[sectionId];
    if (curr in sectionConfigIdMap) {
      newSectionConfigCol[sectionId] = sectionConfigIdMap[curr];
    }
  }

  await saveSectionConfigCol(prisma, newSectionConfigCol, newId);
  return newId;
}
