import { Prisma } from '@prisma/client';
import { prisma } from 'src/db/prisma';
import { getSaltAndHash } from 'src/utils/authUtils';
import { ExistingUserType, NewUserType, SeedUserType } from './types';
import { processUsername } from './utils';

export async function createUser(data: NewUserType) {
  const { salt, password } = getSaltAndHash(data.password);
  data.name = processUsername(data.name);
  return await prisma.user.create({
    data: { ...data, salt, password },
    select: { id: true, name: true },
  });
}

export async function updateUser(data: ExistingUserType) {
  const { salt, password } = getSaltAndHash(data.password);
  const { id, ...withoutId } = data;
  data.name = processUsername(data.name);
  return await prisma.user.update({
    where: { id },
    data: { ...withoutId, salt, password },
  });
}

export async function seedUsers(data: SeedUserType) {
  await prisma.$transaction(
    Object.values(data).map((v) => {
      const { salt, password } = getSaltAndHash(v.password);
      const curr: Prisma.UserGetPayload<true> = {
        id: v.id,
        name: processUsername(v.name),
        darkMode: v.darkMode,
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
