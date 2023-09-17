import { Prisma } from '@prisma/client';
import { ManyEVColType } from 'abcde-utils/src/types/evCol';
import { prisma } from 'src/db/prisma';

export async function saveEVCols(evCols: ManyEVColType) {
  const ids = Object.keys(evCols);
  const inDbFormat: Prisma.EVColCreateArgs['data'][] = [];
  for (const [idid, evCol] of Object.entries(evCols)) {
    for (const [codeInfoId, value] of Object.entries(evCol)) {
      inDbFormat.push({ idid, codeInfoId, value });
    }
  }

  await prisma.$transaction([
    ...ids.map((x) =>
      prisma.eVColId.create({
        data: { id: x },
      }),
    ),
    prisma.eVCol.deleteMany({
      where: { idid: { in: ids } },
    }),
    ...inDbFormat.map((x) => prisma.eVCol.create({ data: x })),
  ]);
}
