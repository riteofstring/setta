import { isSectionUIType, NULL_OBJ_ID } from 'abcde-utils/src/constants';
import { ManyCodeInfoType, RCType } from 'abcde-utils/src/types/codeInfo';
import _ from 'lodash';
import { prisma } from 'src/db/prisma';
import { getChildrenRecursively } from 'src/utils/utils';

export async function getCodeInfoForSectionsAndKwargs(uiTypes) {
  const sectionUITypes = _.pickBy(uiTypes, (v) => isSectionUIType(v));
  const collectionIds = _.flatten(
    _.map(sectionUITypes, (x) => x.config.collections),
  );
  return await getCodeInfo([...collectionIds, NULL_OBJ_ID]);
}

export async function getCodeInfo(ids: string[]): Promise<ManyCodeInfoType> {
  const allIds = await getChildrenRecursively(
    ids,
    async (c) =>
      await prisma.$queryRaw`
          with recursive descendants as (
              select "parentId", "childId"
              from "CodeInfoCol"
              where "parentId" = ${c}
            union
              select x."parentId", x."childId"
              from "CodeInfoCol" x
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

  return output;
}

export async function getCollectionsAndModules(searchTerm: string) {
  const results = await prisma.codeInfo.findMany({
    where: { name: { contains: searchTerm }, rcType: RCType.COLLECTION },
    select: {
      id: true,
      name: true,
      asParent: {
        select: { child: { select: { id: true, name: true } } },
      },
    },
  });
  const processed = results.map((x) => {
    const { asParent, ...theRest } = x;
    return { ...theRest, children: asParent.map((y) => y.child) };
  });
  return _.keyBy(processed, 'id');
}
