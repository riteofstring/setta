import _ = require('lodash');
import { PrismaClient } from '@prisma/client';

export async function saveCodeInfo(
  prisma: PrismaClient,
  codeInfo,
  upsert = false,
) {
  const vals = _.values(codeInfo);
  const data = vals.map((v) =>
    _.pick(v, [
      'id',
      'name',
      'version',
      'type',
      'rcType',
      'defaultVal',
      'description',
      'path',
    ]),
  );

  if (upsert) {
    await prisma.$transaction(
      data.map((v) =>
        prisma.codeInfo.upsert({
          where: { id: v.id },
          create: v,
          update: v,
        }),
      ),
    );
  } else {
    await prisma.codeInfo.createMany({ data, skipDuplicates: true });
  }

  await prisma.$transaction(
    vals.map((v) =>
      prisma.codeInfo.update({
        where: { id: v.id },
        data: {
          children: {
            connect: v.children.map((x) => ({
              id: x,
            })),
          },
          inCodeParentId: v.parentId,
        },
      }),
    ),
  );
}

export async function saveKwargInfo(prisma, kwargInfo) {
  await saveCodeInfo(prisma, kwargInfo, true);
}
