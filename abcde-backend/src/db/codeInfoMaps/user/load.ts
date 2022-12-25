import { prisma } from 'src/db/prisma';
import { reshapeCodeInfoMap, reshapeCodeInfoTypeMap } from '../utils';

export async function getUserCodeInfoMaps(ownerId) {
  const codeInfoMaps = await prisma.userCodeInfoMap.findMany({
    where: { ownerId },
    select: { codeInfoId: true, uiTypeId: true },
  });
  const codeInfoTypeMaps = await prisma.userCodeInfoTypeMap.findMany({
    where: { ownerId },
    select: { type: true, uiTypeId: true },
  });
  return {
    codeInfoMaps: reshapeCodeInfoMap(codeInfoMaps),
    codeInfoTypeMaps: reshapeCodeInfoTypeMap(codeInfoTypeMaps),
  };
}
