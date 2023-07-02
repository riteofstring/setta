import { ManySectionCoreType } from 'abcde-utils/src/types/section';
import {
  ManySectionChildrenType,
  TopLevelSectionChildrenType,
} from 'abcde-utils/src/types/sectionChildren';
import { ManySectionConfigType } from 'abcde-utils/src/types/sectionConfig';
import { SectionConfigColType } from 'abcde-utils/src/types/sectionConfigCol';
import { ManySectionDescriptionType } from 'abcde-utils/src/types/sectionDescription';
import {
  ChildrenSectionPositionType,
  TopLevelSectionPositionType,
} from 'abcde-utils/src/types/sectionPosition';
import _ from 'lodash';
import { prisma } from 'src/db/prisma';
import { deleteThenCreateCol } from 'src/utils/utils';
import {
  PrismaSectionChildrenType,
  PrismaSectionConfigColType,
  PrismaSectionConfigType,
  PrismaSectionDescriptionType,
  PrismaSectionType,
} from './types';

function convertSize(x) {
  return x === 'auto' ? -1 : x;
}

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
      width: convertSize(v.size.width),
      height: convertSize(v.size.height),
      chainedFromId: v.chainedFrom,
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
  const inDbFormat: PrismaSectionConfigType[] = [];
  for (const v of Object.values(sectionConfigs)) {
    inDbFormat.push({
      id: v.id,
      evColId: v.evColId,
      kwargColId: v.kwargColId,
      uiTypeColId: v.uiTypeColId,
      selectedItemId: v.selectedItem,
      uiTypeId: v.uiTypeId,
      descriptionId: v.descriptionId,
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
  const inDbFormat: PrismaSectionConfigColType[] = [];
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

function assembleSectionDescription(
  sectionDescriptions: ManySectionDescriptionType,
) {
  const inDbFormat: PrismaSectionDescriptionType[] = [];
  for (const [k, v] of Object.entries(sectionDescriptions)) {
    inDbFormat.push({
      id: k,
      value: v.value,
      height: v.height,
      visible: v.visible,
    });
  }
  return inDbFormat;
}

export async function saveSectionDescriptions(
  sectionDescriptions: ManySectionDescriptionType,
) {
  const inDbFormat = assembleSectionDescription(sectionDescriptions);
  await prisma.$transaction(
    inDbFormat.map((v) =>
      prisma.sectionDescription.upsert({
        where: { id: v.id },
        create: v,
        update: v,
      }),
    ),
  );
}
