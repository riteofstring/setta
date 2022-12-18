import { Prisma } from '@prisma/client';
import { createSalt, hashPassword } from 'src/auth/utils';
import { prisma } from 'src/prisma';
import { UserType } from './types';

export async function saveUsers(data: UserType) {
  await prisma.$transaction(
    Object.values(data).map((v) => {
      const salt = createSalt();
      const curr: Prisma.UserGetPayload<true> = {
        id: v.id,
        name: v.name,
        salt,
        password: hashPassword(v.password, salt),
      };
      return prisma.user.upsert({
        where: { id: curr.id, name: curr.name },
        create: curr,
        update: curr,
      });
    }),
  );
}
