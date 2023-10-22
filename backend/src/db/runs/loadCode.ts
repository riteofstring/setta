import { prisma } from 'src/db/prisma';

export async function loadCode({
  id,
  ownerId,
}: {
  id: string;
  ownerId: string;
}) {
  return await prisma.run.findFirstOrThrow({
    where: { id, ownerId },
    select: { code: true, projectConfigId: true },
  });
}
