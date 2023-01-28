import { ManyOutputType } from 'abcde-utils/src/types/output';
import { ManyOutputGroupType } from 'abcde-utils/src/types/outputGroup';
import { prisma } from '../prisma';

export async function getRuns(projectConfigId) {
  const runs = await prisma.run.findMany({
    where: { projectConfigId },
    select: {
      outputGroups: {
        select: {
          id: true,
          name: true,
          children: { select: { id: true, name: true, values: true } },
        },
      },
    },
  });

  const outputGroups: ManyOutputGroupType = {};
  const outputs: ManyOutputType = {};

  for (const run of runs) {
    for (const og of run.outputGroups) {
      outputGroups[og.id] = {
        id: og.id,
        name: og.name,
        children: og.children.map((x) => x.id),
      };
      for (const o of og.children) {
        outputs[o.id] = o;
      }
    }
  }

  return { outputGroups, outputs };
}
