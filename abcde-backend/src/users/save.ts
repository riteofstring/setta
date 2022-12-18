import { Prisma } from '@prisma/client';
import { getSaltAndHash } from 'src/auth/utils';
import { prisma } from 'src/prisma';
import { ExistingUserType, NewUserType, SeedUserType } from './types';

export async function createUser(data: NewUserType) {
  const { salt, password } = getSaltAndHash(data.password);
  return await prisma.user.create({ data: { ...data, salt, password } });
}

export async function updateUser(data: ExistingUserType) {
  const { salt, password } = getSaltAndHash(data.password);
  return await prisma.user.update({
    where: { id: data.id },
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
