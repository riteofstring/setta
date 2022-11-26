import _ = require('lodash');
import { PrismaClient } from '@prisma/client';

export async function saveUsers(prisma: PrismaClient, data) {
  await prisma.$transaction(
    _.values(data).map((v) => {
      const curr = _.pick(v, ['id', 'name', 'password']);
      return prisma.user.upsert({
        where: { id: curr.id, name: curr.name },
        create: curr,
        update: curr,
      });
    }),
  );
}
