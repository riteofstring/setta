import { ManyOutputType } from 'abcde-utils/src/types/output';
import { ManyOutputGroupType } from 'abcde-utils/src/types/outputGroup';
import _ from 'lodash';
import { prisma } from 'src/db/prisma';
import { PrismaOutputGroupType, PrismaOutputType } from './types';

function assembleOutputs(outputs: ManyOutputType, outputGroupId) {
  const inDbFormat: PrismaOutputType[] = [];
  for (const [id, v] of Object.entries(outputs)) {
    inDbFormat.push({
      id,
      name: v.name,
      values: v.values,
      outputGroupId,
    });
  }
  return inDbFormat;
}

export async function saveOutputs(
  outputs: ManyOutputType,
  outputGroupId: string,
) {
  const inDbFormat = assembleOutputs(outputs, outputGroupId);
  await prisma.$transaction(
    inDbFormat.map((v) =>
      prisma.output.upsert({
        where: { id: v.id },
        create: v,
        update: v,
      }),
    ),
  );
}

function assembleOutputGroups(
  outputGroups: ManyOutputGroupType,
  runId: string,
) {
  const inDbFormat: PrismaOutputGroupType[] = [];
  for (const [id, v] of Object.entries(outputGroups)) {
    inDbFormat.push({
      id,
      name: v.name,
      runId,
    });
  }
  return inDbFormat;
}

export async function saveOutputGroups(
  outputGroups: ManyOutputGroupType,
  runId: string,
) {
  const inDbFormat = assembleOutputGroups(outputGroups, runId);
  await prisma.$transaction(
    inDbFormat.map((v) =>
      prisma.outputGroup.upsert({
        where: { id: v.id },
        create: v,
        update: v,
      }),
    ),
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
