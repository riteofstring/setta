import { ManyEVType } from 'abcde-utils/src/types/ev';
import { ManyEVColType } from 'abcde-utils/src/types/evCol';
import { prisma } from 'src/db/prisma';
import { deleteThenCreateCol } from 'src/utils/utils';
import { PrismaEVColType, PrismaEVType } from './types';

function assembleEV(ev: ManyEVType) {
  const inDbFormat: PrismaEVType[] = [];
  for (const [id, v] of Object.entries(ev)) {
    inDbFormat.push({
      id,
      value: v !== null ? v.toString() : null,
    });
  }
  return inDbFormat;
}

export async function saveEV(ev: ManyEVType) {
  const inDbFormat = assembleEV(ev);
  await prisma.$transaction(
    inDbFormat.map((v) =>
      prisma.eV.upsert({
        where: { id: v.id },
        create: v,
        update: v,
      }),
    ),
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
