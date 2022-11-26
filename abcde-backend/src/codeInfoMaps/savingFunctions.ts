import _ = require('lodash');
import { PrismaClient } from '@prisma/client';

export async function saveUserCodeInfoTypeMaps(
  prisma: PrismaClient,
  user,
  data,
) {
  const inDbFormat = [];
  for (const [type, mapsTo] of Object.entries(data)) {
    inDbFormat.push({
      ownerId: user.id,
      type,
      ...(mapsTo as Record<string, unknown>),
    });
  }

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
