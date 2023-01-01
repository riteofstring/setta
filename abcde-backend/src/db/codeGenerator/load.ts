import { prisma } from 'src/db/prisma';

export async function loadCode({
  id,
  ownerId,
}: {
  id: string;
  ownerId: string;
}) {
  return await prisma.generatedCode.findFirstOrThrow({
    where: { id, ownerId },
    select: { code: true },
  });
}
