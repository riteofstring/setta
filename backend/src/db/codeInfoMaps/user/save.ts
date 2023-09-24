import { CodeInfoTypeMapType } from 'abcde-utils/src/types/codeInfoMap';
import { prisma } from 'src/db/prisma';
import { PrismaUserCodeInfoTypeMapType } from './types';

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
  data: CodeInfoTypeMapType,
) {
  await saveUserCodeInfoTypeMaps(userId, data);
}
