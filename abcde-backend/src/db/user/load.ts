import { prisma } from 'src/db/prisma';

export async function loadUserByName(username: string) {
  return await prisma.user.findUniqueOrThrow({ where: { name: username } });
}
