import { prisma } from 'src/db/prisma';

export async function saveGeneratedCode({ id, ownerId, code }) {
  return await prisma.generatedCode.create({
    data: { id, ownerId, code },
  });
}
