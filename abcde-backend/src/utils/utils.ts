import { Prisma, PrismaClient } from '@prisma/client';
import * as _ from 'lodash';
import { v4 as uuidv4 } from 'uuid';

export function renameKeys<T>(x: T, toRename: object) {
  const output = _.cloneDeep(x);
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

export function createIdMap(oldIds: string[]) {
  return _.fromPairs(oldIds.map((x) => [x, createNewId()]));
}

export function createNewId() {
  return uuidv4();
}

export function connectIfNotNull(existingObj, otherObj) {
  for (const [key, value] of Object.entries(otherObj)) {
    if (value) {
      existingObj[key] = { connect: { id: value } };
    }
  }
}
