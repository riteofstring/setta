import { PrismaClient } from '@prisma/client';
import { deleteThenCreateCol, prismaNullOrConnect } from 'src/utils/utils';
import _ = require('lodash');

export async function saveEV(prisma: PrismaClient, ev) {
  const inDbFormat = [];
  for (const id of _.keys(ev)) {
    const v = ev[id];
    const curr = { id, value: v.value ? v.value.toString() : null };
    curr['child'] = prismaNullOrConnect(v.childId);
    inDbFormat.push(curr);
  }

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

export async function saveEVCols(prisma: PrismaClient, evCols) {
  const ids = _.keys(evCols);
  await prisma.eVColId.createMany({
    data: ids.map((x) => ({ id: x })),
    skipDuplicates: true,
  });

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

  deleteThenCreateCol(prisma, prisma.eVCol, allColIds, inDbFormat);
}
