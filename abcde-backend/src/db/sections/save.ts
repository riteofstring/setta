import { ManySectionCoreType } from 'abcde-utils/src/types/section';
import {
  ManySectionChildrenType,
  TopLevelSectionChildrenType,
} from 'abcde-utils/src/types/sectionChildren';
import { ManySectionConfigType } from 'abcde-utils/src/types/sectionConfig';
import { SectionConfigColType } from 'abcde-utils/src/types/sectionConfigCol';
import {
  ChildrenSectionPositionType,
  TopLevelSectionPositionType,
} from 'abcde-utils/src/types/sectionPosition';
import _ from 'lodash';
import { prisma } from 'src/db/prisma';
import {
  connectOrCreateColId,
  deleteThenCreateCol,
  prismaNullOrConnect,
} from 'src/utils/utils';
import { PrismaSectionChildrenType, PrismaSectionType } from './types';

export async function saveSections(
  sections: ManySectionCoreType,
  sectionChildren: ManySectionChildrenType,
) {
  await prisma.sectionChildrenId.createMany({
    data: Object.values(sections).map((x) => ({ id: x.sectionChildrenId })),
    skipDuplicates: true,
  });

  const inDbFormat: PrismaSectionType[] = [];
  for (const [id, v] of Object.entries(sections)) {
    inDbFormat.push({
      id,
      name: v.name,
      childrenId: v.sectionChildrenId,
      paramInfoId: v.paramInfoId,
    });
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
  sectionChildren: ManySectionChildrenType | TopLevelSectionChildrenType,
  sectionChildrenIds,
  sectionPositions:
    | ChildrenSectionPositionType
    | TopLevelSectionPositionType = {},
) {
  const allColIds = Object.values(sectionChildrenIds);
  const inDbFormat: PrismaSectionChildrenType[] = [];
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
  await deleteThenCreateCol(prisma.sectionChildren, allColIds, inDbFormat);
}

function assembleSectionConfig(sectionConfigs: ManySectionConfigType) {
  const inDbFormat = [] as any;
  for (const v of Object.values(sectionConfigs)) {
    inDbFormat.push({
      id: v.id,
      evCol: connectOrCreateColId(v.evColId),
      kwargCol: connectOrCreateColId(v.kwargColId),
      selectedItem: prismaNullOrConnect(v.selectedItem),
      uiType: prismaNullOrConnect(v.uiTypeId),
    });
  }
  return inDbFormat;
}

export async function saveSectionConfigs(
  sectionConfigs: ManySectionConfigType,
) {
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

function assembleSectionConfigCol(
  sectionConfigCol: SectionConfigColType,
  colId,
) {
  const inDbFormat = [] as any;
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
  sectionConfigCol: SectionConfigColType,
  colId,
) {
  await prisma.sectionConfigColId.createMany({
    data: [{ id: colId }],
    skipDuplicates: true,
  });

  const inDbFormat = assembleSectionConfigCol(sectionConfigCol, colId);
  await deleteThenCreateCol(prisma.sectionConfigCol, [colId], inDbFormat);
}
