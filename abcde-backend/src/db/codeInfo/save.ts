import { Prisma } from '@prisma/client';
import { ManyCodeInfoType } from 'abcde-utils/src/types/codeInfo';
import { prisma } from 'src/db/prisma';

export async function saveCodeInfo(
  codeInfo: ManyCodeInfoType,
  doUpsert: boolean = false,
) {
  const create = Object.values(codeInfo).map(
    (v): Prisma.CodeInfoCreateArgs['data'] => ({
      id: v.id,
      name: v.name,
      editable: v.editable,
      rcType: v.rcType,
      defaultVal: v.defaultVal,
    }),
  );

  const update = Object.values(codeInfo).map(
    (v): Prisma.CodeInfoUpdateArgs['data'] => ({
      id: v.id,
      asParent: {
        deleteMany: {},
        create: v.children.map((c, idx) => ({ childId: c, order: idx })),
      },
    }),
  );

  if (doUpsert) {
    await prisma.$transaction([
      ...create.map((v) =>
        prisma.codeInfo.upsert({
          where: { id: v.id },
          create: v,
          update: v,
        }),
      ),
      ...update.map((v) =>
        prisma.codeInfo.update({ where: { id: v.id as string }, data: v }),
      ),
    ]);
  } else {
    await prisma.$transaction([
      prisma.codeInfo.createMany({ data: create, skipDuplicates: true }),
      ...update.map((v) =>
        prisma.codeInfo.update({ where: { id: v.id as string }, data: v }),
      ),
    ]);
  }
}
