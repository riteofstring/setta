import { getChildrenRecursively } from 'src/utils/utils';
import { prisma } from '../prisma';

export async function getSectionsRecursively(ids) {
  return await getChildrenRecursively(
    ids,
    async (c) =>
      await prisma.$queryRaw`
              with recursive descendants as (
                  select "parentId", "childId"
                  from "SectionChildren"
                  where "parentId" = ${c}
                union
                  select other."parentId", other."childId"
                  from "SectionChildren" other
                  join descendants on other."parentId" = descendants."childId"
              )
              select * from descendants;`,
  );
}
