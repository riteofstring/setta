import {
  deleteThenCreateCol,
  nullNotUndefined,
  prismaNullOrConnect,
} from '#utils/utils';
import { PrismaClient } from '@prisma/client';
import _ = require('lodash');

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

async function saveRegularUIType(prisma: PrismaClient, db, sliderUITypes) {
  const data = sliderUITypes.map((x) => ({
    idid: x.id,
    ...x.config,
  }));
  await prisma.$transaction(
    data.map((v) =>
      db.upsert({
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
  await saveRegularUIType(
    prisma,
    prisma.sliderUIType,
    _.filter(uiTypes, (v) => v.type === 'SLIDER'),
  );
  await saveRegularUIType(
    prisma,
    prisma.textUIType,
    _.filter(uiTypes, (v) => v.type === 'TEXT'),
  );
  await saveRegularUIType(
    prisma,
    prisma.switchUIType,
    _.filter(uiTypes, (v) => v.type === 'SWITCH'),
  );
  await saveRegularUIType(
    prisma,
    prisma.refUIType,
    _.filter(uiTypes, (v) => v.type === 'REF'),
  );
}

export async function saveUITypeCols(prisma: PrismaClient, uiTypeCols) {
  const ids = _.keys(uiTypeCols);
  await prisma.uITypeColId.createMany({
    data: ids.map((x) => ({ id: x })),
    skipDuplicates: true,
  });

  const inDbFormat = [];
  for (const idid of Object.keys(uiTypeCols)) {
    for (const codeInfoId of _.keys(uiTypeCols[idid])) {
      inDbFormat.push({
        idid,
        codeInfoId,
        uiTypeId: uiTypeCols[idid][codeInfoId],
      });
    }
  }
  deleteThenCreateCol(prisma, prisma.uITypeCol, inDbFormat);
}
