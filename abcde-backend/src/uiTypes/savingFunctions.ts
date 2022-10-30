import { PrismaClient } from '@prisma/client';
import _ = require('lodash');
import { nullNotUndefined, prismaNullOrConnect } from '../utils/utils';

async function saveCoreUITypes(prisma: PrismaClient, uiTypes) {
  const data = _.values(uiTypes).map((x) => ({
    id: x.id,
    type: x.type,
    name: x.name,
    presetType: x.presetType,
    originSection: prismaNullOrConnect(x.originInfoId.sectionId),
    originUITypeCol: prismaNullOrConnect(x.originInfoId.uiTypeColId),
    originCodeInfo: prismaNullOrConnect(x.originInfoId.paramInfoId),
    isForChildOfOriginInfoId: x.isForChildOfOriginInfoId,
  }));

  await prisma.$transaction(
    data.map((v) =>
      prisma.uIType.upsert({
        where: { id: v.id },
        create: v,
        update: v,
      }),
    ),
  );
}

async function saveSectionUITypes(prisma: PrismaClient, sectionUITypes) {
  const uiTypeCols = sectionUITypes
    .filter((x) => x.config.uiTypeColId)
    .map((x) => ({ id: x.config.uiTypeColId }));

  await prisma.uITypeColId.createMany({
    data: uiTypeCols,
    skipDuplicates: true,
  });

  const data = sectionUITypes.map((x) => ({
    idid: x.id,
    uiTypeColId: nullNotUndefined(x.config.uiTypeColId),
    childUITypeId: nullNotUndefined(x.config.childUITypeId),
    subType: x.config.subType,
  }));

  await prisma.sectionUIType.createMany({ data, skipDuplicates: true });

  await prisma.$transaction(
    sectionUITypes.map((v) =>
      prisma.sectionUIType.update({
        where: { idid: v.id },
        data: {
          collections: { set: v.config.collections.map((x) => ({ id: x })) },
        },
      }),
    ),
  );
}

async function saveSliderUITypes(prisma: PrismaClient, sliderUITypes) {
  const data = sliderUITypes.map((x) => ({
    idid: x.id,
    ...x.config,
  }));
  await prisma.$transaction(
    data.map((v) =>
      prisma.sliderUIType.upsert({
        where: { idid: v.idid },
        create: v,
        update: v,
      }),
    ),
  );
}

export async function saveUITypes(prisma: PrismaClient, uiTypes) {
  await saveCoreUITypes(prisma, uiTypes);
  await saveSectionUITypes(
    prisma,
    _.filter(uiTypes, (v) =>
      ['SECTION', 'LIST_ROOT', 'DICT_ROOT', 'DECK', 'GROUP'].includes(v.type),
    ),
  );
  await saveSliderUITypes(
    prisma,
    _.filter(uiTypes, (v) => v.type === 'SLIDER'),
  );
}

// async function persistTextUIType(em, x) {
//   const findBy = { id: x.id };
//   const assign = x.config;
//   await createIfNotFound(em, TextUITypes, findBy, assign);
// }

// async function persistSwitchUIType(em, x) {
//   const findBy = { id: x.id };
//   const assign = x.config;
//   await createIfNotFound(em, SwitchUITypes, findBy, assign);
// }

// async function persistRefUIType(em, x) {
//   const findBy = { id: x.id };
//   const assign = x.config;
//   await createIfNotFound(em, RefUITypes, findBy, assign);
// }

// export async function saveUITypes(em, uiTypes) {
//   // first do all uitypes with the base uitypes entity
//   for (const x of _.values(uiTypes)) {
//     await persistUIType(em, x);
//   }

//   // Then go through them again, but this time create/update the specific types
//   // This is because the specific types might have a config that refers to another uitype.
//   for (const x of _.values(uiTypes)) {
//     if (
//       ['SECTION', 'LIST_ROOT', 'DICT_ROOT', 'DECK', 'GROUP'].includes(x.type)
//     ) {
//       await persistSectionUIType(em, x);
//     } else if (x.type === 'SLIDER') {
//       await persistSliderUIType(em, x);
//     } else if (x.type === 'TEXT') {
//       await persistTextUIType(em, x);
//     } else if (x.type === 'SWITCH') {
//       await persistSwitchUIType(em, x);
//     } else if (x.type === 'REF') {
//       await persistRefUIType(em, x);
//     }
//   }
// }

// export async function persistUITypesCols(em, uiTypesCols) {
//   for (const uiTypeColId of Object.keys(uiTypesCols)) {
//     await createIfNotFound(em, UITypesColsIds, { id: uiTypeColId });
//     for (const codeInfoId of _.keys(uiTypesCols[uiTypeColId])) {
//       const findBy = { id: uiTypeColId, codeInfo: codeInfoId };
//       const assign = { uiType: uiTypesCols[uiTypeColId][codeInfoId] };
//       await createIfNotFound(em, UITypesCols, findBy, assign);
//     }
//   }
// }
