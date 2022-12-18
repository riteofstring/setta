import { prisma } from 'src/prisma';

export async function getProject(id) {
  return await prisma.project.findUnique({
    where: { id },
    select: { id: true, name: true, defaultConfigId: true },
  });
}
