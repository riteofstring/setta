import { Prisma, PrismaClient } from '@prisma/client';
import _ = require('lodash');
import { prismaNullOrConnect } from '../utils/utils';

export async function saveSections(
  prisma: PrismaClient,
  sections,
  sectionChildrenIds,
) {
  await prisma.sectionChildrenId.createMany({
    data: _.values(sectionChildrenIds).map((x) => ({ id: x })),
    skipDuplicates: true,
  });

  const inDbFormat = [];
  for (const v of _.values(sections)) {
    const scid = sectionChildrenIds[v.id];
    const curr = {
      id: v.id,
      name: v.name,
      children: { connect: { id: scid } },
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

  await prisma.sectionChildren.deleteMany({
    where: { idid: { in: inDbFormat.map((x) => x.idid) } },
  });

  await prisma.sectionChildren.createMany({ data: inDbFormat });
}

// export async function persistSectionConfigs(em, sectionConfigs) {
//   for (const v of _.values(sectionConfigs)) {
//     await createIfNotFound(em, EVColsIds, { id: v.evColId });
//     await createIfNotFound(em, KwargColsIds, { id: v.kwargColId });

//     const findBy = { id: v.id };
//     const assign = {
//       evCol: v.evColId,
//       kwargCol: v.kwargColId,
//       selectedItem: v.selectedItem,
//       uiType: v.uiTypeId,
//     };
//     await createIfNotFound(em, SectionConfig, findBy, assign);
//   }
// }

// export async function persistSectionConfigCol(em, sectionConfigCol, colId) {
//   await createIfNotFound(em, SectionConfigColsIds, { id: colId });
//   for (const sectionId of _.keys(sectionConfigCol)) {
//     const findBy = { id: colId, section: sectionId };
//     const assign = { config: sectionConfigCol[sectionId] };
//     await createIfNotFound(em, SectionConfigCols, findBy, assign);
//   }
// }
