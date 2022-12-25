import {
  CodeInfoMapStateType,
  CodeInfoMapType,
  CodeInfoTypeMapType,
} from 'abcde-utils/src/types/codeInfoMap';
import _ from 'lodash';
import { prisma } from 'src/db/prisma';
import {
  PrismaProjectConfigCodeInfoMapType,
  PrismaProjectConfigCodeInfoTypeMapType,
} from './types';

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

function assembleProjectConfigCodeInfoMap(
  projectConfigId: string,
  data: CodeInfoMapType,
) {
  const inDbFormat: PrismaProjectConfigCodeInfoMapType[] = [];
  for (const [x, mapsTo] of Object.entries(data)) {
    inDbFormat.push({
      projectConfigId,
      codeInfoId: x,
      ...mapsTo,
    });
  }
  return inDbFormat;
}

async function saveProjectConfigCodeInfoMaps(projectConfigId, data) {
  const inDbFormat = assembleProjectConfigCodeInfoMap(projectConfigId, data);

  await prisma.$transaction(
    inDbFormat.map((v) =>
      prisma.projectConfigCodeInfoMap.upsert({
        where: {
          projectConfigId_codeInfoId: {
            projectConfigId: v.projectConfigId,
            codeInfoId: v.codeInfoId,
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
  data: CodeInfoMapStateType,
) {
  if (_.isEmpty(data)) {
    return;
  }

  await saveProjectConfigCodeInfoMaps(projectConfigId, data.codeInfoMaps);
  await saveProjectConfigCodeInfoTypeMaps(
    projectConfigId,
    data.codeInfoTypeMaps,
  );
}
