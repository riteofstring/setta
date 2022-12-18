import { prisma } from 'src/db/prisma';

export async function loadCode({ id, ownerId }) {
  return await prisma.generatedCode.findFirst({
    where: { id, ownerId },
    select: { code: true },
  });
}
