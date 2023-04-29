import {
  isSectionUIType,
  REF,
  SLIDER,
  SWITCH,
  TEXT,
} from 'abcde-utils/src/constants';
import {
  ManySectionUITypeType,
  ManyUITypeType,
} from 'abcde-utils/src/types/uiType';
import { ManyUITypeColType } from 'abcde-utils/src/types/uiTypeCol';
import _ from 'lodash';
import { prisma } from 'src/db/prisma';
import { deleteThenCreateCol } from 'src/utils/utils';
import { PrismaUITypeColType } from './types';

async function saveCoreUITypes(userId: string | null, uiTypes: ManyUITypeType) {
  const data = _.mapValues(uiTypes, (x) => {
    return {
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

  // create any missing uiTypeCols because saveUITypeCols is usually called later
  const originUITypeCols = _.map(data, (v) => v.originUITypeColId).filter(
    (v): v is string => !!v,
  );
  await prisma.$transaction(
    originUITypeCols.map((v) => {
      const where = { id: v };
      return prisma.uITypeColId.upsert({ where, create: where, update: where });
    }),
  );

  await prisma.$transaction(
    _.map(data, (v, id) =>
      prisma.uIType.upsert({
        where: { id, ownerId: userId },
        create: { id, ...v },
        update: { id, ...v },
      }),
    ),
  );
}

export async function saveSectionUITypes(
  sectionUITypes: ManySectionUITypeType,
) {
  const data = Object.keys(sectionUITypes).map((k) => ({
    idid: k,
  }));

  await prisma.sectionUIType.createMany({ data, skipDuplicates: true });

  await prisma.$transaction(
    _.map(sectionUITypes, (v, k) =>
      prisma.sectionUIType.update({
        where: { idid: k },
        data: {
          collections: { set: v.config.collections.map((x) => ({ id: x })) },
          outputGroupId: v.config.outputGroup,
          childUITypeId: v.config.childUITypeId,
          subType: v.config.subType,
        },
      }),
    ),
  );
}

async function saveRegularUIType(db, uiTypes: ManyUITypeType) {
  if (Object.keys(uiTypes).length === 0) {
    return;
  }
  const data = _.map(uiTypes, (x, k) => ({
    idid: k,
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
  await saveSectionUITypes(extractSectionUITypes(uiTypes));
  await saveRegularUIType(
    prisma.sliderUIType,
    _.pickBy(uiTypes, (v) => v.type === SLIDER),
  );
  await saveRegularUIType(
    prisma.textUIType,
    _.pickBy(uiTypes, (v) => v.type === TEXT),
  );
  await saveRegularUIType(
    prisma.switchUIType,
    _.pickBy(uiTypes, (v) => v.type === SWITCH),
  );
  await saveRegularUIType(
    prisma.refUIType,
    _.pickBy(uiTypes, (v) => v.type === REF),
  );
}

export async function saveUITypeCols(uiTypeCols: ManyUITypeColType) {
  const ids = Object.keys(uiTypeCols);
  await prisma.uITypeColId.createMany({
    data: ids.map((x) => ({ id: x })),
    skipDuplicates: true,
  });

  const inDbFormat: PrismaUITypeColType[] = [];
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

export function extractSectionUITypes(
  uiTypes: ManyUITypeType,
): ManySectionUITypeType {
  return _.pickBy(uiTypes, isSectionUIType);
}
