import { Prisma, PrismaClient } from '@prisma/client';
import * as _ from 'lodash';

export interface UserObj {
  [id: string]: Prisma.UserGetPayload<{
    include: { projects: { select: { id: true } } };
  }>;
}

export async function saveUsers(prisma: PrismaClient, data: UserObj) {
  await prisma.$transaction(
    Object.values(data).map((v) => {
      const curr = _.pick(v, ['id', 'name', 'password']);
      return prisma.user.upsert({
        where: { id: curr.id, name: curr.name },
        create: curr,
        update: curr,
      });
    }),
  );
}
