import { PrismaClient } from '@prisma/client';
import {
  createIdMap,
  deleteThenCreateCol,
  prismaNullOrConnect,
  renameKeys,
} from 'src/utils/utils';
import _ = require('lodash');

function assembleEV(ev) {
  const inDbFormat = [];
  for (const id of _.keys(ev)) {
    const v = ev[id];
    const curr = { id, value: v.value ? v.value.toString() : null };
    curr['child'] = prismaNullOrConnect(v.childId);
    inDbFormat.push(curr);
  }
  return inDbFormat;
}

export async function saveEV(prisma: PrismaClient, ev) {
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

export async function copyEV(prisma: PrismaClient, ev) {
  const inDbFormat = assembleEV(ev);
  const withoutId = inDbFormat.map((x) => _.pick(x, ['value', 'child']));

  // TODO: see if they fix this: https://github.com/prisma/prisma/issues/8131
  const newEv = await prisma.$transaction(
    withoutId.map((x) => prisma.eV.create({ data: x })),
  );
  // maps from old id to new id
  return createIdMap(inDbFormat, newEv);
}

function assembleEVCols(evCols) {
  const allColIds = Object.keys(evCols);
  const inDbFormat = [];

  for (const idid of allColIds) {
    for (const codeInfoId of _.keys(evCols[idid])) {
      inDbFormat.push({
        idid,
        codeInfoId,
        evId: evCols[idid][codeInfoId],
      });
    }
  }
  return inDbFormat;
}

export async function saveEVCols(prisma: PrismaClient, evCols) {
  const ids = _.keys(evCols);
  await prisma.eVColId.createMany({
    data: ids.map((x) => ({ id: x })),
    skipDuplicates: true,
  });

  const allColIds = Object.keys(evCols);
  const inDbFormat = assembleEVCols(evCols);

  deleteThenCreateCol(prisma, prisma.eVCol, allColIds, inDbFormat);
}

export async function copyEVCols(prisma: PrismaClient, evCols, evIdMap) {
  // create new evColId entities
  const evColIds = _.keys(evCols);
  const newEVColIds = await prisma.$transaction(
    evColIds.map(() => prisma.eVColId.create({ data: {} })),
  );
  const evColIdIdMap = createIdMap(
    evColIds.map((x) => ({ id: x })),
    newEVColIds,
  );

  // replace evColIds
  const evColsWithNewIds = renameKeys(evCols, evColIdIdMap);
  // replace ev ids
  for (const idid of _.keys(evColsWithNewIds)) {
    for (const codeInfoId of _.keys(evColsWithNewIds[idid])) {
      const curr = evColsWithNewIds[idid][codeInfoId];
      evColsWithNewIds[idid][codeInfoId] = evIdMap[curr];
    }
  }

  await saveEVCols(prisma, evColsWithNewIds);

  return evColIdIdMap;
}
