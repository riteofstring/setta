import _ = require('lodash');

export async function getCodeInfoForSectionsAndKwargs(
  prisma,
  sectionUITypes,
  kwargCols,
) {
  const collectionIds = [].concat(
    ..._.map(sectionUITypes, (x) => x.config.collections),
  );
  const kwargIds = [];
  _.forEach(kwargCols, (x) =>
    _.forEach(_.values(x), (y) => kwargIds.push(...y)),
  );
  return await getCodeInfo(prisma, [...collectionIds, ...kwargIds]);
}

export async function getCodeInfo(prisma, ids: string[]) {
  const collectionIds = new Set(ids);
  const childMap = {};
  const allIds = new Set(collectionIds);
  collectionIds.forEach((x) => (childMap[x] = new Set()));

  for (const c of collectionIds) {
    const parentChildPairs = await prisma.$queryRaw`
          with recursive descendants as (
              select "A", "B"
              from "_CodeInfoChildren"
              where "A" = ${c}::uuid
            union
              select x."A", x."B"
              from "_CodeInfoChildren" x
              join descendants on x."A" = descendants."B"
          )
          select * from descendants;`;

    parentChildPairs.forEach((x) => {
      const child = x.B;
      childMap[x.A].add(child);
      if (!(child in childMap)) {
        childMap[child] = new Set();
      }
      allIds.add(child);
    });
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
  const childrenIds = Array.from(childMap[codeInfo.id]);
  return {
    ...theRest,
    parentId: inCodeParentId,
    children: childrenIds,
  };
}
