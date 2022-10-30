import { Prisma, PrismaClient } from '@prisma/client';
import _ = require('lodash');
import { prismaNullOrConnect } from '../utils/utils';

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

  const inDbFormat = [];
  for (const idid of Object.keys(evCols)) {
    for (const codeInfoId of _.keys(evCols[idid])) {
      inDbFormat.push({
        idid,
        codeInfoId,
        evId: evCols[idid][codeInfoId],
      });
    }
  }

  await prisma.eVCol.deleteMany({
    where: { idid: { in: inDbFormat.map((x) => x.idid) } },
  });

  await prisma.eVCol.createMany({ data: inDbFormat });
}
