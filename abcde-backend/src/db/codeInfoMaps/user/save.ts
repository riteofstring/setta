import {
  CodeInfoMapStateType,
  CodeInfoMapType,
  CodeInfoTypeMapType,
} from 'abcde-utils/src/types/codeInfoMap';
import { prisma } from 'src/db/prisma';
import {
  PrismaUserCodeInfoMapType,
  PrismaUserCodeInfoTypeMapType,
} from './types';

function assembleUserCodeInfoMap(userId: string, data: CodeInfoMapType) {
  const inDbFormat: PrismaUserCodeInfoMapType[] = [];
  for (const [x, mapsTo] of Object.entries(data)) {
    inDbFormat.push({
      ownerId: userId,
      codeInfoId: x,
      ...mapsTo,
    });
  }
  return inDbFormat;
}

async function saveUserCodeInfoMaps(userId: string, data: CodeInfoMapType) {
  const inDbFormat = assembleUserCodeInfoMap(userId, data);

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

function assembleUserCodeInfoTypeMap(
  userId: string,
  data: CodeInfoTypeMapType,
) {
  const inDbFormat: PrismaUserCodeInfoTypeMapType[] = [];
  for (const [x, mapsTo] of Object.entries(data)) {
    inDbFormat.push({
      ownerId: userId,
      type: x,
      ...mapsTo,
    });
  }
  return inDbFormat;
}

async function saveUserCodeInfoTypeMaps(
  userId: string,
  data: CodeInfoTypeMapType,
) {
  const inDbFormat = assembleUserCodeInfoTypeMap(userId, data);

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

export async function saveAllUserCodeInfoMaps(
  userId: string,
  data: CodeInfoMapStateType,
) {
  await saveUserCodeInfoMaps(userId, data.codeInfoMaps);
  await saveUserCodeInfoTypeMaps(userId, data.codeInfoTypeMaps);
}
