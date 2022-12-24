import { prisma } from 'src/db/prisma';
import { deleteThenCreateCol } from 'src/utils/utils';
import { EVColType, EVType } from './types';

function assembleEV(ev: EVType) {
  const inDbFormat = [] as any;
  for (const [id, v] of Object.entries(ev)) {
    const curr = {
      id,
      value: v.value ? v.value.toString() : null,
      childId: v.childId,
    };
    inDbFormat.push(curr);
  }
  return inDbFormat;
}

export async function saveEV(ev: EVType) {
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

function assembleEVCols(evCols: EVColType) {
  const inDbFormat = [] as any;
  for (const [idid, evCol] of Object.entries(evCols)) {
    for (const [codeInfoId, evId] of Object.entries(evCol as any)) {
      inDbFormat.push({ idid, codeInfoId, evId });
    }
  }
  return inDbFormat;
}

export async function saveEVCols(evCols: EVColType) {
  const ids = Object.keys(evCols);
  await prisma.eVColId.createMany({
    data: ids.map((x) => ({ id: x })),
    skipDuplicates: true,
  });

  const inDbFormat = assembleEVCols(evCols);
  await deleteThenCreateCol(prisma.eVCol, ids, inDbFormat);
}
