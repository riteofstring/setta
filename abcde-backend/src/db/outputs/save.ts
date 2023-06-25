import { Prisma } from '@prisma/client';
import { ManyOutputType } from 'abcde-utils/src/types/output';
import { ManyOutputGroupType } from 'abcde-utils/src/types/outputGroup';
import _ from 'lodash';
import { prisma } from 'src/db/prisma';

export async function saveOutputs(
  outputs: ManyOutputType,
  outputGroupId: string,
) {
  await prisma.$transaction(
    Object.entries(outputs).map(([id, v]) => {
      const x: Prisma.OutputUpsertArgs['create'] = {
        id,
        name: v.name,
        values: v.values,
        outputGroupId,
      };
      return prisma.output.upsert({
        where: { id: x.id },
        create: x,
        update: x,
      });
    }),
  );
}

export async function saveOutputGroups(
  outputGroups: ManyOutputGroupType,
  runId: string,
) {
  await prisma.$transaction(
    Object.entries(outputGroups).map(([id, v]) => {
      const x: Prisma.OutputGroupUpsertArgs['create'] = {
        id,
        name: v.name,
        runId,
      };
      return prisma.outputGroup.upsert({
        where: { id: x.id },
        create: x,
        update: x,
      });
    }),
  );
}

export async function saveOutputGroupsAndOutputs(
  outputGroups: ManyOutputGroupType,
  runId: string,
  outputs: ManyOutputType,
) {
  await saveOutputGroups(outputGroups, runId);
  for (const [id, outputGroup] of Object.entries(outputGroups)) {
    const currOutputs = _.pick(outputs, outputGroup.children);
    await saveOutputs(currOutputs, id);
  }
}
