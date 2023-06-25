import { Prisma } from '@prisma/client';
import { ManyEVType } from 'abcde-utils/src/types/ev';
import { ManyEVColType } from 'abcde-utils/src/types/evCol';
import { prisma } from 'src/db/prisma';

export async function saveEV(ev: ManyEVType) {
  await prisma.$transaction(
    Object.keys(ev).map((id) => {
      const value = ev[id];
      const x = { id, value: value !== null ? value.toString() : null };
      return prisma.eV.upsert({
        where: { id: x.id },
        create: x,
        update: x,
      });
    }),
  );
}

export async function saveEVCols(evCols: ManyEVColType) {
  const ids = Object.keys(evCols);
  const inDbFormat: Prisma.EVColCreateManyInput[] = [];
  for (const [idid, evCol] of Object.entries(evCols)) {
    for (const [codeInfoId, evId] of Object.entries(evCol)) {
      inDbFormat.push({ idid, codeInfoId, evId });
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
