import { Prisma, PrismaClient } from '@prisma/client';
import { createIdMap, deleteThenCreateCol, renameKeys } from 'src/utils/utils';

interface EVObj {
  [id: string]: Prisma.EVGetPayload<true>;
}

interface EVColObj {
  [id: string]: { [codeInfoId: string]: string };
}

function assembleEV(ev: EVObj) {
  const inDbFormat = [];
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

export async function saveEV(prisma: PrismaClient, ev: EVObj) {
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

function assembleEVCols(evCols) {
  const inDbFormat = [];
  for (const [idid, evCol] of Object.entries(evCols)) {
    for (const [codeInfoId, evId] of Object.entries(evCol)) {
      inDbFormat.push({ idid, codeInfoId, evId });
    }
  }
  return inDbFormat;
}

export async function saveEVCols(prisma: PrismaClient, evCols) {
  const ids = Object.keys(evCols);
  await prisma.eVColId.createMany({
    data: ids.map((x) => ({ id: x })),
    skipDuplicates: true,
  });

  const inDbFormat = assembleEVCols(evCols);
  deleteThenCreateCol(prisma, prisma.eVCol, ids, inDbFormat);
}

export function copyEV(ev) {
  const oldIds = Object.keys(ev);
  const evIdMap = createIdMap(oldIds);
  const newEv = renameKeys(ev, evIdMap);
  return { newEv, evIdMap };
}

export function copyEVCols(evCols: EVColObj, evIdMap) {
  const oldIds = Object.keys(evCols);
  const evColIdMap = createIdMap(oldIds);
  const newEvCols = renameKeys(evCols, evColIdMap);

  // replace ev ids
  for (const newEvCol of Object.values(newEvCols)) {
    for (const [codeInfoId, evId] of Object.entries(newEvCol)) {
      if (evId in evIdMap) {
        newEvCol[codeInfoId] = evIdMap[evId];
      }
    }
  }

  return { newEvCols, evColIdMap };
}
