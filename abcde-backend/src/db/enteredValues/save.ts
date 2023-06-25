import { ManyEVType } from 'abcde-utils/src/types/ev';
import { ManyEVColType } from 'abcde-utils/src/types/evCol';
import { prisma } from 'src/db/prisma';
import { deleteThenCreateCol } from 'src/utils/utils';
import { PrismaEVColType } from './types';

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

function assembleEVCols(evCols: ManyEVColType) {
  const inDbFormat: PrismaEVColType[] = [];
  for (const [idid, evCol] of Object.entries(evCols)) {
    for (const [codeInfoId, evId] of Object.entries(evCol)) {
      inDbFormat.push({ idid, codeInfoId, evId });
    }
  }
  return inDbFormat;
}

export async function saveEVCols(evCols: ManyEVColType) {
  const ids = Object.keys(evCols);
  await prisma.eVColId.createMany({
    data: ids.map((x) => ({ id: x })),
    skipDuplicates: true,
  });

  const inDbFormat = assembleEVCols(evCols);
  await deleteThenCreateCol(prisma.eVCol, ids, inDbFormat);
}
