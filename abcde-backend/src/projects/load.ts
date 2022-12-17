import { PrismaClient } from '@prisma/client';

export async function getProject(prisma: PrismaClient, id) {
  return await prisma.project.findUnique({
    where: { id },
    select: { id: true, name: true, defaultConfigId: true },
  });
}
