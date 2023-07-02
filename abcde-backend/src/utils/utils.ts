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

export async function deleteThenCreateCol(db, allColIds, data) {
  await prisma.$transaction([
    db.deleteMany({
      where: { idid: { in: allColIds } },
    }),

    db.createMany({ data }),
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
