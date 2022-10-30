import { PrismaClient } from '@prisma/client';
import _ = require('lodash');
import { prismaNullOrConnect } from '../utils/utils';

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

export async function saveUITypes(prisma: PrismaClient, uiTypes) {
  await saveCoreUITypes(prisma, uiTypes);
}

// async function persistSectionUIType(em, x) {
//   const {
//     config: { collections, uiTypeColId, childUITypeId, subType },
//   } = x;

//   if (uiTypeColId) {
//     await createIfNotFound(em, UITypesColsIds, { id: uiTypeColId });
//   }

//   if (childUITypeId) {
//     await createIfNotFound(em, UITypes, { id: childUITypeId });
//   }

//   const findBy = { id: x.id };
//   const assign = {
//     collections,
//     uiTypeCol: uiTypeColId,
//     childUIType: childUITypeId,
//     subType,
//   };
//   await createIfNotFound(em, SectionUITypes, findBy, assign);
// }

// async function persistSliderUIType(em, x) {
//   const findBy = { id: x.id };
//   const assign = x.config;
//   await createIfNotFound(em, SliderUITypes, findBy, assign);
// }

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
