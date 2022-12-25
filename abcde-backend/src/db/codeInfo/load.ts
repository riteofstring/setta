import { ManyCodeInfoType, RCType } from 'abcde-utils/src/types/codeInfo';
import { ManyKwargColType } from 'abcde-utils/src/types/kwargCol';
import _ from 'lodash';
import { prisma } from 'src/db/prisma';
import { getOrderedChildren } from 'src/utils/utils';
import { createAllInfo } from './infoFactory';
import { ChildMapType, ParentChildPairsType } from './types';

export async function getCodeInfoForSectionsAndKwargs(
  sectionUITypes,
  kwargCols: ManyKwargColType,
) {
  const collectionIds = [].concat(
    ..._.map(sectionUITypes, (x) => x.config.collections),
  );
  const kwargIds: string[] = [];
  _.forEach(kwargCols, (x) =>
    _.forEach(Object.values(x), (y) => kwargIds.push(...y)),
  );
  const allCodeInfo = await getCodeInfo([...collectionIds, ...kwargIds]);
  return createAllInfo(allCodeInfo);
}

export async function getCodeInfo(ids: string[]): Promise<ManyCodeInfoType> {
  const collectionIds = new Set(ids);
  let childMap = {};
  const allIds = new Set(collectionIds);

  for (const c of collectionIds) {
    const parentChildPairs: ParentChildPairsType = await prisma.$queryRaw`
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

export function processCodeInfo(codeInfo, childMap: ChildMapType) {
  let children: string[] = [];
  if (codeInfo.id in childMap) {
    children = getOrderedChildren(childMap[codeInfo.id], 'childId');
  }
  return { ...codeInfo, children };
}

export async function getCollectionsAndModules(searchTerm: string) {
  const results = await prisma.codeInfo.findMany({
    where: { name: { contains: searchTerm }, rcType: RCType.COLLECTION },
    select: {
      id: true,
      name: true,
      description: true,
      path: true,
      asParent: {
        select: { child: { select: { id: true, name: true, path: true } } },
      },
    },
  });
  const processed = results.map((x) => {
    const output = { ...x, children: x.asParent.map((y) => y.child) } as any;
    delete output.asParent;
    return output;
  });
  return _.keyBy(processed, 'id');
}
