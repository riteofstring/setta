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

export function copyEV(ev) {
  const oldIds = _.keys(ev);
  const evIdMap = createIdMap(oldIds);
  const newEv = renameKeys(ev, evIdMap);
  return { newEv, evIdMap };
}

export function copyEVCols(evCols, evIdMap) {
  const oldIds = _.keys(evCols);
  const evColIdMap = createIdMap(oldIds);
  const newEvCols = renameKeys(evCols, evColIdMap);

  // replace ev ids
  for (const idid of _.keys(newEvCols)) {
    for (const codeInfoId of _.keys(newEvCols[idid])) {
      const curr = newEvCols[idid][codeInfoId];
      if (curr in evIdMap) {
        newEvCols[idid][codeInfoId] = evIdMap[curr];
      }
    }
  }

  return { newEvCols, evColIdMap };
}
