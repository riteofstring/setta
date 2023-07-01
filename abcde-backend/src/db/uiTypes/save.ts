import { Prisma } from '@prisma/client';
import { SECTION, SLIDER } from 'abcde-utils/src/constants';
import { ManyUITypeType } from 'abcde-utils/src/types/uiType';
import { ManyUITypeColType } from 'abcde-utils/src/types/uiTypeCol';
import { prisma } from 'src/db/prisma';
import { deleteThenCreateColNonBatched } from 'src/utils/utils';

export async function saveUITypes(userId, uiTypes: ManyUITypeType) {
  const create = Object.values(uiTypes).map(
    (x): Prisma.UITypeUpsertArgs['create'] => ({
      id: x.id,
      ownerId: userId,
      type: x.type,
      name: x.name,
      presetType: x.presetType,
    }),
  );

  const update = Object.values(uiTypes).map(
    (x): Prisma.UITypeUpdateArgs['data'] => ({
      id: x.id,
      ownerId: userId,
      ...processConfig(x.type, x.config),
    }),
  );

  await prisma.$transaction([
    ...create.map((v) =>
      prisma.uIType.upsert({
        where: { id: v.id, ownerId: v.ownerId },
        create: v,
        update: v,
      }),
    ),
    ...update.map((v) =>
      prisma.uIType.update({
        where: { id: v.id as string, ownerId: v.ownerId as string },
        data: v,
      }),
    ),
  ]);
}

function processConfig(
  type: string,
  config,
): Partial<Prisma.UITypeUpdateArgs['data']> {
  if (type === SECTION) {
    return {
      sectionConfigSubType: config.subType,
      sectionConfigCollections: {
        set: config.collections.map((x) => ({ id: x })),
      },
      sectionConfigChildUITypeId: config.childUITypeId,
    };
  } else if (type === SLIDER) {
    return {
      sliderConfigMin: config.min,
      sliderConfigMax: config.max,
      sliderConfigStep: config.step,
    };
  } else {
    return {};
  }
}

export async function saveUITypeCols(uiTypeCols: ManyUITypeColType) {
  const ids = Object.keys(uiTypeCols);
  await prisma.uITypeColId.createMany({
    data: ids.map((x) => ({ id: x })),
    skipDuplicates: true,
  });

  const inDbFormat: any[] = [];
  for (const idid of ids) {
    for (const [codeInfoId, uiInfo] of Object.entries(uiTypeCols[idid])) {
      inDbFormat.push({
        idid,
        codeInfoId,
        uiTypeId: uiInfo.uiTypeId,
        nonPresetUITypes: {
          connect: uiInfo.nonPresetUITypeIds.map((x) => ({ id: x })),
        },
      });
    }
  }
  await deleteThenCreateColNonBatched(prisma.uITypeCol, ids, inDbFormat);
}
