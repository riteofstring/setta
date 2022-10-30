import { Prisma, PrismaClient } from '@prisma/client';

export function renameKeys(x, toRename) {
  const output = { ...x };
  for (const oldK of Object.keys(toRename)) {
    const newK = toRename[oldK];
    if (oldK in output) {
      output[newK] = output[oldK];
      delete output[oldK];
    }
  }
  return output;
}

export function nullNotUndefined(x) {
  return x === undefined ? null : x;
}

export function prismaNullOrConnect(x) {
  return !x ? Prisma.DbNull : { connect: { id: x } };
}

export async function deleteThenCreateCol(prisma: PrismaClient, db, data) {
  await prisma.$transaction([
    db.deleteMany({
      where: { idid: { in: data.map((x) => x.idid) } },
    }),

    db.createMany({ data }),
  ]);
}
