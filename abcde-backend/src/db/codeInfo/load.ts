import { isSectionUIType, NULL_OBJ_ID } from 'abcde-utils/src/constants';
import { ManyCodeInfoType, RCType } from 'abcde-utils/src/types/codeInfo';
import { ManyKwargColType } from 'abcde-utils/src/types/kwargCol';
import _ from 'lodash';
import { prisma } from 'src/db/prisma';
import { getChildrenRecursively, getOrderedChildren } from 'src/utils/utils';
import { createAllInfo } from './infoFactory';
import { ChildMapType } from './types';

export async function getCodeInfoForSectionsAndKwargs(
  sections,
  uiTypes,
  kwargCols: ManyKwargColType,
) {
  const sectionUITypes = _.pickBy(uiTypes, (v) => isSectionUIType(v));
  const userSpecifiedObjectIds = _.filter(
    sections,
    (s) => s.userSpecifiedObjectId,
  ).map((x) => x.userSpecifiedObjectId);
  const collectionIds = [].concat(
    ..._.map(sectionUITypes, (x) => x.config.collections),
  );
  const kwargIds: string[] = [];
  _.forEach(kwargCols, (x) =>
    _.forEach(Object.values(x), (y) => kwargIds.push(...y)),
  );
  const allCodeInfo = await getCodeInfo([
    ...userSpecifiedObjectIds,
    ...collectionIds,
    ...kwargIds,
    NULL_OBJ_ID,
  ]);
  return createAllInfo(allCodeInfo);
}

export async function getCodeInfo(ids: string[]): Promise<ManyCodeInfoType> {
  const { childMap, allIds } = await getChildrenRecursively(
    ids,
    async (c) =>
      await prisma.$queryRaw`
          with recursive descendants as (
              select "parentId", "childId", "order"
              from "CodeInfoChildren"
              where "parentId" = ${c}::uuid
            union
              select x."parentId", x."childId", x."order"
              from "CodeInfoChildren" x
              join descendants on x."parentId" = descendants."childId"
          )
          select * from descendants;`,
  );

  const codeInfo = await prisma.codeInfo.findMany({
    where: { id: { in: allIds } },
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
    const { asParent, ...theRest } = x;
    return { ...theRest, children: asParent.map((y) => y.child) };
  });
  return _.keyBy(processed, 'id');
}
