import _ from 'lodash';
import { prisma } from 'src/db/prisma';

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

function reshapeCodeInfoMap(x) {
  return _.mapValues(_.keyBy(x, 'codeInfoId'), (y) => ({
    uiTypeId: y.uiTypeId,
  }));
}

function reshapeCodeInfoTypeMap(x) {
  return _.mapValues(_.keyBy(x, 'type'), (y) => ({ uiTypeId: y.uiTypeId }));
}
