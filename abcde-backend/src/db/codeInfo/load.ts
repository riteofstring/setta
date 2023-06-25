import { isSectionUIType, NULL_OBJ_ID } from 'abcde-utils/src/constants';
import { CodeInfoStateType, RCType } from 'abcde-utils/src/types/codeInfo';
import { ManyKwargColType } from 'abcde-utils/src/types/kwargCol';
import _ from 'lodash';
import { prisma } from 'src/db/prisma';
import { getChildrenRecursively } from 'src/utils/utils';

export async function getCodeInfoForSectionsAndKwargs(
  sections,
  uiTypes,
  kwargCols: ManyKwargColType,
) {
  const sectionUITypes = _.pickBy(uiTypes, (v) => isSectionUIType(v));
  const userSpecifiedObjectIds = _.map(
    sections,
    (s) => s.userSpecifiedObjectId,
  ).filter((s) => s);
  const collectionIds = _.flatten(
    _.map(sectionUITypes, (x) => x.config.collections),
  );
  const kwargIds: string[] = [];
  _.forEach(kwargCols, (x) =>
    _.forEach(Object.values(x), (y) => kwargIds.push(...y)),
  );
  return await getCodeInfo([
    ...userSpecifiedObjectIds,
    ...collectionIds,
    ...kwargIds,
    NULL_OBJ_ID,
  ]);
}

export async function getCodeInfo(ids: string[]): Promise<CodeInfoStateType> {
  const allIds = await getChildrenRecursively(
    ids,
    async (c) =>
      await prisma.$queryRaw`
          with recursive descendants as (
              select "parentId", "childId"
              from "CodeInfoChildren"
              where "parentId" = ${c}::uuid
            union
              select x."parentId", x."childId"
              from "CodeInfoChildren" x
              join descendants on x."parentId" = descendants."childId"
          )
          select * from descendants;`,
  );

  const codeInfo = await prisma.codeInfo.findMany({
    where: { id: { in: allIds } },
    include: {
      asParent: {
        select: { childId: true },
        orderBy: { order: 'asc' },
      },
    },
  });

  const output = {};
  codeInfo.forEach((x) => {
    const { asParent, ...theRest } = x;
    output[x.id] = { ...theRest, children: asParent.map((y) => y.childId) };
  });

  return { allCodeInfo: output };
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
