import { Prisma, PrismaClient } from '@prisma/client';
import _ = require('lodash');

export function renameKeys(x, toRename) {
  const output = { ...x };
  for (const oldK of Object.keys(toRename)) {
    const newK = toRename[oldK];
    if (oldK in output) {
      output[newK] = output[oldK];
      delete output[oldK];
    }
  }
  return output;
}

export function nullNotUndefined(x) {
  return x === undefined ? null : x;
}

export function prismaNullOrConnect(x) {
  return !x ? Prisma.DbNull : { connect: { id: x } };
}

export async function deleteThenCreateCol(
  prisma: PrismaClient,
  db,
  allColIds,
  data,
) {
  await prisma.$transaction([
    db.deleteMany({
      where: { idid: { in: allColIds } },
    }),

    db.createMany({ data }),
  ]);
}

export function connectOrCreateColId(x) {
  return { connectOrCreate: { where: { id: x }, create: { id: x } } };
}

export function getOrderedChildren(children, toReturn = null) {
  const output = _.orderBy(children, (v) => v.order);
  if (toReturn) {
    return output.map((x) => (toReturn ? x[toReturn] : x));
  }
  return output;
}

export function createIdMap(oldIds, newIds) {
  return _.fromPairs(oldIds.map((x, idx) => [x.id, newIds[idx].id]));
}
