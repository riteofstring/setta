import {
  isSectionUIType,
  REF,
  SLIDER,
  SWITCH,
  TEXT,
} from 'abcde-utils/src/constants';
import { ManyUITypeType } from 'abcde-utils/src/types/uiType';
import { ManyUITypeColType } from 'abcde-utils/src/types/uiTypeCol';
import * as _ from 'lodash';
import { prisma } from 'src/db/prisma';
import { deleteThenCreateCol, nullNotUndefined } from 'src/utils/utils';

async function saveCoreUITypes(userId: string | null, uiTypes: ManyUITypeType) {
  const data = Object.values(uiTypes).map((x) => {
    return {
      id: x.id,
      ownerId: userId,
      type: x.type,
      name: x.name,
      presetType: x.presetType,
      isForChildOfOriginInfoId: x.isForChildOfOriginInfoId,
      originSectionId: x.originInfoId.sectionId,
      originUITypeColId: x.originInfoId.uiTypeColId,
      originCodeInfoId: x.originInfoId.paramInfoId,
    };
  });

  await prisma.$transaction(
    data.map((v) =>
      prisma.uIType.upsert({
        where: { id: v.id, ownerId: userId },
        create: v,
        update: v,
      }),
    ),
  );
}

async function saveSectionUITypes(sectionUITypes) {
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

async function saveRegularUIType(db, uiTypes) {
  if (uiTypes.length === 0) {
    return;
  }
  const data = uiTypes.map((x) => ({
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

export async function saveUITypes(userId, uiTypes: ManyUITypeType) {
  await saveCoreUITypes(userId, uiTypes);
  await saveSectionUITypes(_.filter(uiTypes, (v) => isSectionUIType(v.type)));
  await saveRegularUIType(
    prisma.sliderUIType,
    _.filter(uiTypes, (v) => v.type === SLIDER),
  );
  await saveRegularUIType(
    prisma.textUIType,
    _.filter(uiTypes, (v) => v.type === TEXT),
  );
  await saveRegularUIType(
    prisma.switchUIType,
    _.filter(uiTypes, (v) => v.type === SWITCH),
  );
  await saveRegularUIType(
    prisma.refUIType,
    _.filter(uiTypes, (v) => v.type === REF),
  );
}

export async function saveUITypeCols(uiTypeCols: ManyUITypeColType) {
  const ids = Object.keys(uiTypeCols);
  await prisma.uITypeColId.createMany({
    data: ids.map((x) => ({ id: x })),
    skipDuplicates: true,
  });

  const inDbFormat = [] as any;
  for (const idid of ids) {
    for (const [codeInfoId, uiTypeId] of Object.entries(uiTypeCols[idid])) {
      inDbFormat.push({
        idid,
        codeInfoId,
        uiTypeId,
      });
    }
  }
  await deleteThenCreateCol(prisma.uITypeCol, ids, inDbFormat);
}
