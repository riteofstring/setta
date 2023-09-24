import { Prisma } from '@prisma/client';
import { ManyOutputType } from 'abcde-utils/src/types/output';
import { ManyOutputGroupType } from 'abcde-utils/src/types/outputGroup';
import { ManyRunType } from 'abcde-utils/src/types/run';
import _ from 'lodash';
import { prisma } from 'src/db/prisma';
import { saveOutputGroupsAndOutputs } from '../outputs/save';

export async function saveRuns(runs: ManyRunType, projectConfigId: string) {
  await prisma.$transaction(
    Object.entries(runs).map(([id, v]) => {
      const x: Prisma.RunUpsertArgs['create'] = {
        id,
        name: v.name,
        projectConfigId,
        ownerId: v.ownerId,
        code: v.code,
      };
      return prisma.run.upsert({
        where: { id: x.id },
        create: x,
        update: x,
      });
    }),
  );
}

export async function saveRunsAndOutputs(
  runs: ManyRunType,
  projectConfigId: string,
  outputGroups: ManyOutputGroupType,
  outputs: ManyOutputType,
) {
  await saveRuns(runs, projectConfigId);
  for (const [id, run] of Object.entries(runs)) {
    const currOutputGroups = _.pick(outputGroups, run.outputGroups);
    await saveOutputGroupsAndOutputs(currOutputGroups, id, outputs);
  }
}
