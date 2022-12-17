import { PrismaClient } from '@prisma/client';
import * as _ from 'lodash';

function assembleUserCodeInfoMap(user, data, mapsFrom) {
  const inDbFormat = [];
  for (const [x, mapsTo] of Object.entries(data)) {
    inDbFormat.push({
      ownerId: user.id,
      [mapsFrom]: x,
      ...(mapsTo as Record<string, unknown>),
    });
  }
  return inDbFormat;
}

async function saveUserCodeInfoTypeMaps(prisma: PrismaClient, user, data) {
  const inDbFormat = assembleUserCodeInfoMap(user, data, 'type');

  await prisma.$transaction(
    inDbFormat.map((v) =>
      prisma.userCodeInfoTypeMap.upsert({
        where: {
          ownerId_type: {
            ownerId: v.ownerId,
            type: v.type,
          },
        },
        create: v,
        update: v,
      }),
    ),
  );
}

async function saveUserCodeInfoMaps(prisma: PrismaClient, user, data) {
  const inDbFormat = assembleUserCodeInfoMap(user, data, 'codeInfoId');

  await prisma.$transaction(
    inDbFormat.map((v) =>
      prisma.userCodeInfoMap.upsert({
        where: {
          ownerId_codeInfoId: {
            ownerId: v.ownerId,
            codeInfoId: v.codeInfoId,
          },
        },
        create: v,
        update: v,
      }),
    ),
  );
}

export async function saveAllUserCodeInfoMaps(
  prisma: PrismaClient,
  user,
  data,
) {
  await saveUserCodeInfoMaps(prisma, user, data.codeInfoMaps);
  await saveUserCodeInfoTypeMaps(prisma, user, data.codeInfoTypeMaps);
}

function assembleProjectConfigCodeInfoMap(projectConfigId, data, mapsFrom) {
  const inDbFormat = [];
  for (const [x, mapsTo] of Object.entries(data)) {
    inDbFormat.push({
      projectConfigId,
      [mapsFrom]: x,
      ...(mapsTo as Record<string, unknown>),
    });
  }
  return inDbFormat;
}

async function saveProjectConfigCodeInfoTypeMaps(
  prisma: PrismaClient,
  projectConfigId,
  data,
) {
  const inDbFormat = assembleProjectConfigCodeInfoMap(
    projectConfigId,
    data,
    'type',
  );

  await prisma.$transaction(
    inDbFormat.map((v) =>
      prisma.projectConfigCodeInfoTypeMap.upsert({
        where: {
          projectConfigId_type: {
            projectConfigId: v.projectConfigId,
            type: v.type,
          },
        },
        create: v,
        update: v,
      }),
    ),
  );
}

async function saveProjectConfigCodeInfoMaps(
  prisma: PrismaClient,
  projectConfigId,
  data,
) {
  const inDbFormat = assembleProjectConfigCodeInfoMap(
    projectConfigId,
    data,
    'codeInfoId',
  );

  await prisma.$transaction(
    inDbFormat.map((v) =>
      prisma.projectConfigCodeInfoMap.upsert({
        where: {
          projectConfigId_codeInfoId: {
            projectConfigId: v.projectConfigId,
            codeInfoId: v.codeInfoId,
          },
        },
        create: v,
        update: v,
      }),
    ),
  );
}

export async function saveAllProjectConfigCodeInfoMaps(
  prisma: PrismaClient,
  projectConfigId,
  data,
) {
  if (_.isEmpty(data)) {
    return;
  }

  await saveProjectConfigCodeInfoMaps(
    prisma,
    projectConfigId,
    data.codeInfoMaps,
  );
  await saveProjectConfigCodeInfoTypeMaps(
    prisma,
    projectConfigId,
    data.codeInfoTypeMaps,
  );
}
