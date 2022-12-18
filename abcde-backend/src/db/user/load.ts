import { prisma } from 'src/db/prisma';

export async function loadUser(username) {
  return await prisma.user.findUnique({ where: { name: username } });
}
