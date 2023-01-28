import { ManyOutputType } from 'abcde-utils/src/types/output';
import { ManyOutputGroupType } from 'abcde-utils/src/types/outputGroup';
import { ManyRunType } from 'abcde-utils/src/types/run';
import _ from 'lodash';
import { prisma } from 'src/db/prisma';
import { saveOutputGroupsAndOutputs } from '../outputs/save';
import { PrismaRunType } from './types';

function assembleRuns(runs: ManyRunType, projectConfigId: string) {
  const inDbFormat: PrismaRunType[] = [];
  for (const [id, v] of Object.entries(runs)) {
    inDbFormat.push({
      id,
      name: v.name,
      projectConfigId,
      ownerId: v.ownerId,
      code: v.code,
    });
  }
  return inDbFormat;
}

export async function saveRuns(runs: ManyRunType, projectConfigId: string) {
  const inDbFormat = assembleRuns(runs, projectConfigId);
  await prisma.$transaction(
    inDbFormat.map((v) =>
      prisma.run.upsert({
        where: { id: v.id },
        create: v,
        update: v,
      }),
    ),
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
