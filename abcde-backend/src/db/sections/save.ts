import {
  ManySectionChildrenType,
  ManySectionTypeSaveProjectToBackend,
} from 'abcde-utils/src/types/section';
import { ChildrenSectionPositionType } from 'abcde-utils/src/types/sectionPosition';
import _ from 'lodash';
import { prisma } from 'src/db/prisma';
import { deleteThenCreateChildren } from 'src/utils/utils';
import {
  PrismaSectionChildrenType,
  PrismaSectionDetailsType,
  PrismaSectionType,
} from './types';

function convertSize(x) {
  return x === 'auto' ? -1 : x;
}

export async function saveSections(
  sections: ManySectionTypeSaveProjectToBackend,
) {
  const inDbFormat: PrismaSectionType[] = [];
  for (const [id, v] of Object.entries(sections)) {
    inDbFormat.push({
      id,
      name: v.name,
      paramInfoId: null,
      width: convertSize(v.size.width),
      height: convertSize(v.size.height),
      chainedFromId: v.chainedFrom,
      zIndex: v.zIndex,
      evColId: null,
      uiTypeId: null,
      kwargColId: null,
      uiTypeColId: null,
      selectedItemId: null,
      description: v.description,
      descriptionHeight: v.descriptionHeight,
      descriptionVisible: v.descriptionVisible,
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

  const sectionChildren = _.mapValues(sections, (s) => s.children);
  await saveSectionChildren(sectionChildren, {});
}

export async function updateSectionsWithDetails(
  sections: ManySectionTypeSaveProjectToBackend,
) {
  const inDbFormat: PrismaSectionDetailsType[] = [];
  for (const [id, v] of Object.entries(sections)) {
    inDbFormat.push({
      id,
      paramInfoId: v.paramInfoId,
      evColId: v.evColId,
      uiTypeId: v.uiTypeId,
      kwargColId: v.kwargColId,
      uiTypeColId: v.uiTypeColId,
      selectedItemId: v.selectedItem,
    });
  }

  await prisma.$transaction(
    inDbFormat.map((v) => {
      const { id, ...theRest } = v;
      return prisma.section.update({
        where: { id },
        data: theRest,
      });
    }),
  );
}

export async function saveSectionChildren(
  sectionChildren: ManySectionChildrenType,
  sectionPositions: ChildrenSectionPositionType,
  db: any = prisma.sectionChildren,
) {
  const inDbFormat: PrismaSectionChildrenType[] = [];
  for (const [parentSectionId, currChildren] of Object.entries(
    sectionChildren,
  )) {
    for (const [order, sectionId] of currChildren.entries()) {
      const position = sectionPositions[parentSectionId]?.[sectionId];
      inDbFormat.push({
        parentId: parentSectionId,
        childId: sectionId,
        order,
        x: position?.x,
        y: position?.y,
      });
    }
  }
  await deleteThenCreateChildren(db, inDbFormat);
}
