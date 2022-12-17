import { Prisma, PrismaClient } from '@prisma/client';
import * as _ from 'lodash';

interface CodeInfoObj {
  [id: string]: Prisma.CodeInfoGetPayload<true> & { parentId: string };
}

export async function saveCodeInfo(
  prisma: PrismaClient,
  codeInfo: CodeInfoObj,
  upsert = false,
) {
  const vals = Object.values(codeInfo);
  const data = vals.map((v) =>
    _.pick(v, [
      'id',
      'name',
      'version',
      'type',
      'rcType',
      'defaultVal',
      'description',
      'path',
    ]),
  );

  if (upsert) {
    await prisma.$transaction(
      data.map((v) =>
        prisma.codeInfo.upsert({
          where: { id: v.id },
          create: v,
          update: v,
        }),
      ),
    );
  } else {
    await prisma.codeInfo.createMany({ data, skipDuplicates: true });
  }

  await prisma.codeInfoChildren.deleteMany({
    where: { parentId: { in: vals.map((v) => v.id) } },
  });
  await prisma.codeInfoChildren.createMany({
    data: assembleCodeInfoChildren(vals),
  });

  await prisma.$transaction(
    vals.map((v) =>
      prisma.codeInfo.update({
        where: { id: v.id },
        data: {
          inCodeParentId: v.parentId,
        },
      }),
    ),
  );
}

export async function saveKwargInfo(prisma, kwargInfo) {
  await saveCodeInfo(prisma, kwargInfo, true);
}

function assembleCodeInfoChildren(codeInfoVals) {
  const output = [];
  for (const c of codeInfoVals) {
    for (const [order, child] of c.children.entries()) {
      output.push({ parentId: c.id, childId: child, order });
    }
  }
  return output;
}
