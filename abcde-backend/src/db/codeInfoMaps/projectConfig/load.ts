import { prisma } from 'src/db/prisma';
import { reshapeCodeInfoTypeMap } from '../utils';

export async function getProjectConfigCodeInfoMaps(projectConfigId) {
  const codeInfoTypeMaps = await prisma.projectConfigCodeInfoTypeMap.findMany({
    where: { projectConfigId },
    select: { type: true, uiTypeId: true },
  });
  return reshapeCodeInfoTypeMap(codeInfoTypeMaps);
}
