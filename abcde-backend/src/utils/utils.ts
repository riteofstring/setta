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

export function getOrderedChildren<
  T extends { order: number },
  K extends keyof T,
>(children: T[], toReturn: K) {
  const output = getOrderedChildrenFull(children);
  return output.map((x) => x[toReturn]);
}

export function getOrderedChildrenFull<T extends { order: number }>(
  children: T[],
) {
  return _.orderBy(children, (v) => v.order);
}

export function createIdMap(oldIds: string[]) {
  return _.fromPairs(oldIds.map((x) => [x, createNewId()]));
}

export function ifUndefinedThenNull(x) {
  return x === undefined ? null : x;
}

type ParentChildPairsType = { parentId: string; childId: string }[];

export async function getChildrenRecursively(ids: string[], queryFn) {
  const collectionIds = new Set(ids);
  let childMap = {};
  const allIds = new Set(collectionIds);

  for (const c of collectionIds) {
    const parentChildPairs: ParentChildPairsType = await queryFn(c);
    const currChildMap = _.groupBy(parentChildPairs, (v) => v.parentId);
    childMap = { ...childMap, ...currChildMap };
    parentChildPairs.forEach((x) => allIds.add(x.childId));
  }

  return { allIds: Array.from(allIds), childMap };
}
