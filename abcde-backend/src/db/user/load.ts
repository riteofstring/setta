import { prisma } from 'src/db/prisma';
import { processUsername } from './utils';

export async function loadUserByName(username: string) {
  return await prisma.user.findUniqueOrThrow({
    where: { name: processUsername(username) },
  });
}
