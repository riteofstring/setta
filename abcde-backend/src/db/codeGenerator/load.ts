import { prisma } from 'src/db/prisma';

export async function loadCode({ id, ownerId }) {
  return await prisma.generatedCode.findFirstOrThrow({
    where: { id, ownerId },
    select: { code: true },
  });
}
