import { Prisma, PrismaClient } from '@prisma/client';
import * as _ from 'lodash';
import {
  connectOrCreateColId,
  createIdMap,
  deleteThenCreateCol,
  prismaNullOrConnect,
  renameKeys,
} from 'src/utils/utils';

interface SectionChildrenObj {
  [id: string]: string[];
}

interface SectionConfigObj {
  [id: string]: Prisma.SectionConfigGetPayload<{
    include: { selectedItem: true };
  }>;
}

interface SectionConfigColObj {
  [id: string]: string;
}

interface SectionObj {
  [id: string]: Prisma.SectionGetPayload<true> & { sectionChildrenId: string };
}

export async function saveSections(
  prisma: PrismaClient,
  sections: SectionObj,
  sectionChildren,
) {
  await prisma.sectionChildrenId.createMany({
    data: Object.values(sections).map((x) => ({ id: x.sectionChildrenId })),
    skipDuplicates: true,
  });

  const inDbFormat = [];
  for (const v of Object.values(sections)) {
    const curr = {
      id: v.id,
      name: v.name,
      childrenId: v.sectionChildrenId,
      paramInfoId: v.paramInfoId,
    };
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
  sectionChildren: SectionChildrenObj,
  sectionChildrenIds,
  sectionPositions = {},
) {
  const allColIds = Object.values(sectionChildrenIds);
  const inDbFormat = [];
  for (const [parentSectionId, currChildren] of Object.entries(
    sectionChildren,
  )) {
    for (const [order, sectionId] of currChildren.entries()) {
      const position = sectionPositions[parentSectionId]?.[sectionId];
      inDbFormat.push({
        idid: sectionChildrenIds[parentSectionId],
        sectionId,
        order,
        x: position?.x,
        y: position?.y,
      });
    }
  }
  deleteThenCreateCol(prisma, prisma.sectionChildren, allColIds, inDbFormat);
}

function assembleSectionConfig(sectionConfigs: SectionConfigObj) {
  const inDbFormat = [];
  for (const v of Object.values(sectionConfigs)) {
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

function assembleSectionConfigCol(sectionConfigCol, colId) {
  const inDbFormat = [];
  for (const [sectionId, configId] of Object.entries(sectionConfigCol)) {
    inDbFormat.push({
      idid: colId,
      sectionId,
      configId,
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

export function copySectionConfigs(
  sectionConfigs: SectionConfigObj,
  evColIdMap,
) {
  const oldIds = Object.keys(sectionConfigs);
  const sectionConfigIdMap = createIdMap(oldIds);
  const newSectionConfigs = renameKeys(sectionConfigs, sectionConfigIdMap);

  for (const curr of Object.values(newSectionConfigs)) {
    curr.id = sectionConfigIdMap[curr.id];
    if (curr.evColId in evColIdMap) {
      curr.evColId = evColIdMap[curr.evColId];
    }
  }
  return { newSectionConfigs, sectionConfigIdMap };
}

export function copySectionConfigCol(
  sectionConfigCol: SectionConfigColObj,
  sectionConfigIdMap,
) {
  const newSectionConfigCol = _.cloneDeep(sectionConfigCol);
  for (const [sectionId, configId] of Object.entries(newSectionConfigCol)) {
    if (configId in sectionConfigIdMap) {
      newSectionConfigCol[sectionId] = sectionConfigIdMap[configId];
    }
  }
  return newSectionConfigCol;
}
