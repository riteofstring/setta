import * as _ from 'lodash';
import { prisma } from 'src/db/prisma';
import {
  connectOrCreateColId,
  deleteThenCreateCol,
  prismaNullOrConnect,
} from 'src/utils/utils';
import { SectionChildrenType, SectionConfigType, SectionType } from './types';

export async function saveSections(sections: SectionType, sectionChildren) {
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
    sectionChildren,
    _.mapValues(sections, (v) => v.sectionChildrenId),
  );
}

export async function saveSectionChildren(
  sectionChildren: SectionChildrenType,
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
  deleteThenCreateCol(prisma.sectionChildren, allColIds, inDbFormat);
}

function assembleSectionConfig(sectionConfigs: SectionConfigType) {
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

export async function saveSectionConfigs(sectionConfigs) {
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

export async function saveSectionConfigCol(sectionConfigCol, colId) {
  await prisma.sectionConfigColId.createMany({
    data: [{ id: colId }],
    skipDuplicates: true,
  });

  const inDbFormat = assembleSectionConfigCol(sectionConfigCol, colId);
  deleteThenCreateCol(prisma.sectionConfigCol, [colId], inDbFormat);
}
