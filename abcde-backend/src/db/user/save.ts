import { Prisma } from '@prisma/client';
import { prisma } from 'src/db/prisma';
import { getSaltAndHash } from 'src/utils/authUtils';
import { SeedUserType, UserType } from './types';

export async function createUser(data: UserType) {
  const { salt, password } = getSaltAndHash(data.password);
  return await prisma.user.create({ data: { ...data, salt, password } });
}

export async function updateUser(data: UserType) {
  const { salt, password } = getSaltAndHash(data.password);
  return await prisma.user.update({
    where: { name: data.name },
    data: { ...data, salt, password },
  });
}

export async function seedUsers(data: SeedUserType) {
  await prisma.$transaction(
    Object.values(data).map((v) => {
      const { salt, password } = getSaltAndHash(v.password);
      const curr: Prisma.UserGetPayload<true> = {
        id: v.id,
        name: v.name,
        salt,
        password,
      };
      return prisma.user.upsert({
        where: { id: curr.id, name: curr.name },
        create: curr,
        update: curr,
      });
    }),
  );
}
