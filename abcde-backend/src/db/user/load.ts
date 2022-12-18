import { prisma } from 'src/db/prisma';

export async function loadUser(username: string) {
  return await prisma.user.findUniqueOrThrow({ where: { name: username } });
}
