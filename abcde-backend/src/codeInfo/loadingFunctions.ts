import * as _ from 'lodash';
import { KwargColsType } from 'src/kwargs/types';
import { getOrderedChildren } from 'src/utils/utils';
import { createAllInfo } from './infoFactory';

export async function getCodeInfoForSectionsAndKwargs(
  prisma,
  sectionUITypes,
  kwargCols: KwargColsType,
) {
  const collectionIds = [].concat(
    ..._.map(sectionUITypes, (x) => x.config.collections),
  );
  const kwargIds = [];
  _.forEach(kwargCols, (x) =>
    _.forEach(Object.values(x), (y) => kwargIds.push(...y)),
  );
  const allCodeInfo = await getCodeInfo(prisma, [
    ...collectionIds,
    ...kwargIds,
  ]);
  return createAllInfo(allCodeInfo);
}

export async function getCodeInfo(prisma, ids: string[]) {
  const collectionIds = new Set(ids);
  let childMap = {};
  const allIds = new Set(collectionIds);

  for (const c of collectionIds) {
    const parentChildPairs = await prisma.$queryRaw`
          with recursive descendants as (
              select "parentId", "childId", "order"
              from "CodeInfoChildren"
              where "parentId" = ${c}::uuid
            union
              select x."parentId", x."childId", x."order"
              from "CodeInfoChildren" x
              join descendants on x."parentId" = descendants."childId"
          )
          select * from descendants;`;

    const currChildMap = _.groupBy(parentChildPairs, (v) => v.parentId);
    childMap = { ...childMap, ...currChildMap };
    parentChildPairs.forEach((x) => allIds.add(x.childId));
  }

  const codeInfo = await prisma.codeInfo.findMany({
    where: { id: { in: Array.from(allIds) } },
  });
  const output = {};
  codeInfo.forEach((x) => {
    output[x.id] = processCodeInfo(x, childMap);
  });

  return output;
}

export function processCodeInfo(codeInfo, childMap) {
  const { inCodeParentId, ...theRest } = codeInfo;
  let children = [];
  if (codeInfo.id in childMap) {
    children = getOrderedChildren(childMap[codeInfo.id], 'childId');
  }
  return {
    ...theRest,
    parentId: inCodeParentId,
    children,
  };
}
