import { Prisma } from '@prisma/client';
import { ManyEVColType } from 'abcde-utils/src/types/evCol';
import { prisma } from 'src/db/prisma';

export async function saveEVCols(evCols: ManyEVColType) {
  const ids = Object.keys(evCols);
  const inDbFormat: Prisma.EVColCreateManyArgs['data'] = [];
  for (const [idid, evCol] of Object.entries(evCols)) {
    for (const [codeInfoId, value] of Object.entries(evCol)) {
      inDbFormat.push({ idid, codeInfoId, value });
    }
  }

  await prisma.$transaction([
    prisma.eVColId.createMany({
      data: ids.map((x) => ({ id: x })),
      skipDuplicates: true,
    }),
    prisma.eVCol.deleteMany({
      where: { idid: { in: ids } },
    }),
    prisma.eVCol.createMany({ data: inDbFormat }),
  ]);
}
