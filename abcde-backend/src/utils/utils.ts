import { createNewId } from 'abcde-utils/src/utils';
import _ from 'lodash';
import { prisma } from 'src/db/prisma';

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

export async function deleteThenCreateColNonBatched(db, allColIds, data) {
  await prisma.$transaction([
    db.deleteMany({
      where: { idid: { in: allColIds } },
    }),

    ...data.map((x) => db.create({ data: x })),
  ]);
}

export function getOrderedChildrenFull<T extends { order: number }>(
  children: T[],
) {
  return _.orderBy(children, (v) => v.order);
}

export function createIdMap(oldIds: string[]) {
  return _.fromPairs(oldIds.map((x) => [x, createNewId()]));
}

export async function getChildrenRecursively(ids: string[], queryFn) {
  const allIds = new Set(ids);
  for (const c of ids) {
    const parentChildPairs: { parentId: string; childId: string }[] =
      await queryFn(c);
    parentChildPairs.forEach((x) => allIds.add(x.childId));
  }
  return Array.from(allIds);
}

export function deleteManyFirst<T, K extends keyof T>(v: T, key: K) {
  return {
    ...v,
    [key]: {
      deleteMany: {},
      ...v[key],
    },
  };
}
