import { prisma } from 'src/db/prisma';
import { reshapeCodeInfoMap, reshapeCodeInfoTypeMap } from '../utils';

export async function getProjectConfigCodeInfoMaps(projectConfigId) {
  const codeInfoMaps = await prisma.projectConfigCodeInfoMap.findMany({
    where: { projectConfigId },
    select: { codeInfoId: true, uiTypeId: true },
  });
  const codeInfoTypeMaps = await prisma.projectConfigCodeInfoTypeMap.findMany({
    where: { projectConfigId },
    select: { type: true, uiTypeId: true },
  });
  return {
    codeInfoMaps: reshapeCodeInfoMap(codeInfoMaps),
    codeInfoTypeMaps: reshapeCodeInfoTypeMap(codeInfoTypeMaps),
  };
}
