import { PrismaClient } from '@prisma/client';
import _ = require('lodash');

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
    if (v.paramInfoId) {
      curr['paramInfo'] = {
        connect: { id: v.paramInfoId },
      };
    }
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

// export async function persistSections(em, sections, sectionChildrenIds) {
//   for (const v of _.values(sections)) {
//     const scid = sectionChildrenIds[v.id];
//     await createIfNotFound(em, SectionChildrenIds, { id: scid });
//     const findBy = { id: v.id };
//     const assign = {
//       name: v.name,
//       paramInfo: v.paramInfoId,
//       children: scid,
//     };
//     await createIfNotFound(em, Sections, findBy, assign);
//   }
// }

// export async function persistSectionChildren(
//   em,
//   sectionChildren,
//   sectionChildrenIds,
// ) {
//   for (const sectionId of _.keys(sectionChildren)) {
//     await persistOneSectionChildren(
//       em,
//       sectionChildren[sectionId],
//       sectionChildrenIds[sectionId],
//     );
//   }
// }

// export async function persistOneSectionChildren(
//   em,
//   sectionChildren,
//   sectionChildrenId,
// ) {
//   const col = await createIfNotFound(em, SectionChildrenIds, {
//     id: sectionChildrenId,
//   });
//   const childEntities = [];
//   for (let i = 0; i < sectionChildren.length; i++) {
//     const findBy = { id: sectionChildrenId, section: sectionChildren[i] };
//     const assign = { order: i };
//     const newOne = await createIfNotFound(em, SectionChildren, findBy, assign);
//     childEntities.push(newOne);
//   }
//   console.log('childEntities', childEntities);
//   col.sectionChildren.set(childEntities);
//   em.persist(col);
// }

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
