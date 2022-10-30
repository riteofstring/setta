import _ = require('lodash');
import { PrismaClient } from '@prisma/client';

export async function saveCodeInfo(prisma: PrismaClient, codeInfo) {
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
  await prisma.codeInfo.createMany({ data, skipDuplicates: true });

  await Promise.all(
    vals.map(async (v) => {
      await prisma.codeInfo.update({
        where: { id: v.id },
        data: {
          children: {
            connect: v.children.map((x) => ({
              id: x,
            })),
          },
        },
      });
    }),
  );
}
