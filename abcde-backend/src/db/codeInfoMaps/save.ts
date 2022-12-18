import * as _ from 'lodash';
import { prisma } from 'src/db/prisma';

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

async function saveUserCodeInfoTypeMaps(user, data) {
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

async function saveUserCodeInfoMaps(user, data) {
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

export async function saveAllUserCodeInfoMaps(user, data) {
  await saveUserCodeInfoMaps(user, data.codeInfoMaps);
  await saveUserCodeInfoTypeMaps(user, data.codeInfoTypeMaps);
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

async function saveProjectConfigCodeInfoTypeMaps(projectConfigId, data) {
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

async function saveProjectConfigCodeInfoMaps(projectConfigId, data) {
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

export async function saveAllProjectConfigCodeInfoMaps(projectConfigId, data) {
  if (_.isEmpty(data)) {
    return;
  }

  await saveProjectConfigCodeInfoMaps(projectConfigId, data.codeInfoMaps);
  await saveProjectConfigCodeInfoTypeMaps(
    projectConfigId,
    data.codeInfoTypeMaps,
  );
}
