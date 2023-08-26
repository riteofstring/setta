import { prisma } from 'src/db/prisma';
import { reshapeCodeInfoTypeMap } from '../utils';

export async function getUserCodeInfoMaps(ownerId) {
  const codeInfoTypeMaps = await prisma.userCodeInfoTypeMap.findMany({
    where: { ownerId },
    select: { type: true, uiTypeId: true },
  });
  return reshapeCodeInfoTypeMap(codeInfoTypeMaps);
}
