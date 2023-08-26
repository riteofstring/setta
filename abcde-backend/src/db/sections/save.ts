import { Prisma } from '@prisma/client';
import { ManySectionTypeSaveProjectToBackend } from 'abcde-utils/src/types/section';
import { prisma } from 'src/db/prisma';

export async function saveSections(
  sections: ManySectionTypeSaveProjectToBackend,
) {
  const upsert = Object.values(sections).map(
    (v): Prisma.SectionUpsertArgs['create'] => ({
      id: v.id,
      name: v.name,
      paramInfoId: v.paramInfoId,
      width: convertSize(v.size.width),
      height: convertSize(v.size.height),
      chainedFromId: v.chainedFrom,
      evColId: v.evColId,
      uiTypeId: v.uiTypeId,
      uiTypeColId: v.uiTypeColId,
      selectedItemId: v.selectedItem,
      social: v.social,
      outputGroupId: v.outputGroup,
      description: v.description,
      descriptionHeight: v.descriptionHeight,
      descriptionVisible: v.descriptionVisible,
    }),
  );

  const update = Object.values(sections).map(
    (v): Prisma.SectionUpdateArgs['data'] => ({
      id: v.id,
      nonPresetUITypes: {
        set: v.nonPresetUITypeIds.map((x) => ({ id: x })),
      },
      children: {
        deleteMany: {},
        create: v.children.map((c, idx) => ({
          childId: c,
          order: idx,
        })),
      },
    }),
  );

  await prisma.$transaction([
    ...upsert.map((v) =>
      prisma.section.upsert({
        where: { id: v.id },
        create: v,
        update: v,
      }),
    ),
    ...update.map((v) =>
      prisma.section.update({ where: { id: v.id as string }, data: v }),
    ),
  ]);
}

function convertSize(x) {
  return x === 'auto' ? -1 : x;
}
