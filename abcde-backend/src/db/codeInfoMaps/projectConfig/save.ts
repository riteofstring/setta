import { CodeInfoTypeMapType } from 'abcde-utils/src/types/codeInfoMap';
import { prisma } from 'src/db/prisma';
import { PrismaProjectConfigCodeInfoTypeMapType } from './types';

function assembleProjectConfigCodeInfoTypeMap(
  projectConfigId: string,
  data: CodeInfoTypeMapType,
) {
  const inDbFormat: PrismaProjectConfigCodeInfoTypeMapType[] = [];
  for (const [x, mapsTo] of Object.entries(data)) {
    inDbFormat.push({
      projectConfigId,
      type: x,
      ...mapsTo,
    });
  }
  return inDbFormat;
}

async function saveProjectConfigCodeInfoTypeMaps(
  projectConfigId: string,
  data: CodeInfoTypeMapType,
) {
  const inDbFormat = assembleProjectConfigCodeInfoTypeMap(
    projectConfigId,
    data,
  );

  await prisma.$transaction(
    inDbFormat.map((v) =>
      prisma.projectConfigCodeInfoTypeMap.upsert({
        where: {
          projectConfigId_type: {
            projectConfigId: v.projectConfigId,
            type: v.type,
          },
        },
        create: v,
        update: v,
      }),
    ),
  );
}

export async function saveAllProjectConfigCodeInfoMaps(
  projectConfigId: string,
  data: CodeInfoTypeMapType,
) {
  await saveProjectConfigCodeInfoTypeMaps(projectConfigId, data);
}
