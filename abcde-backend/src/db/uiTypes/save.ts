import {
  isSectionUIType,
  REF,
  SLIDER,
  SWITCH,
  TEXT,
} from 'abcde-utils/src/constants';
import {
  ManyUITypeType,
  SectionUITypeType,
  UITypeType,
} from 'abcde-utils/src/types/uiType';
import { ManyUITypeColType } from 'abcde-utils/src/types/uiTypeCol';
import _ from 'lodash';
import { prisma } from 'src/db/prisma';
import { deleteThenCreateCol } from 'src/utils/utils';
import { PrismaUITypeColType } from './types';

async function saveCoreUITypes(userId: string | null, uiTypes: ManyUITypeType) {
  const data = Object.values(uiTypes).map((x) => {
    return {
      id: x.id,
      ownerId: userId,
      type: x.type,
      name: x.name,
      presetType: x.presetType,
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

export async function saveSectionUITypes(sectionUITypes: SectionUITypeType[]) {
  const data = sectionUITypes.map((x) => ({
    idid: x.id,
  }));

  await prisma.sectionUIType.createMany({ data, skipDuplicates: true });

  await prisma.$transaction(
    sectionUITypes.map((v) =>
      prisma.sectionUIType.update({
        where: { idid: v.id },
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

async function saveRegularUIType(db, uiTypes: UITypeType[]) {
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
  await saveSectionUITypes(extractSectionUITypes(uiTypes));
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

export function extractSectionUITypes(uiTypes: ManyUITypeType) {
  const sectionUITypes: SectionUITypeType[] = [];
  _.forEach(uiTypes, (v) => {
    if (isSectionUIType(v)) {
      sectionUITypes.push(v);
    }
  });
  return sectionUITypes;
}
