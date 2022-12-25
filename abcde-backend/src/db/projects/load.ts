import _ from 'lodash';
import { getCodeInfoForSectionsAndKwargs } from 'src/db/codeInfo/load';
import {
  getProjectConfigCodeInfoMaps,
  getUserCodeInfoMaps,
} from 'src/db/codeInfoMaps/load';
import { prisma } from 'src/db/prisma';
import { getProjectConfig } from 'src/db/projectConfigs/load';
import {
  getSectionConfigs,
  getSections,
  setSectionPositions,
} from 'src/db/sections/load';
import { getBaseUITypes, getPresetUITypes } from 'src/db/uiTypes/load';

export async function getProject(id: string) {
  return await prisma.project.findUniqueOrThrow({
    where: { id },
    select: { id: true, name: true, defaultConfigId: true },
  });
}

export async function loadAllUsersProjects(ownerId) {
  const ps = await prisma.project.findMany({
    where: { ownerId },
    include: { configs: true },
  });
  return _.keyBy(ps, 'id');
}

export async function loadOne(
  userId,
  id: string,
  configId: string,
): Promise<any> {
  const project = await getProject(id);
  const { projectConfig, sectionConfigCol, sectionPositions } =
    await getProjectConfig(configId);
  const { sections, sectionChildren } = await getSections(
    Object.keys(sectionConfigCol),
  );
  const { sectionConfigs, ev, evCols, kwargCols, sectionUITypes, uiTypeCols } =
    await getSectionConfigs(Object.values(sectionConfigCol));

  const baseUITypes = await getBaseUITypes();
  const presetUITypes = await getPresetUITypes(userId);
  const codeInfo = await getCodeInfoForSectionsAndKwargs(
    sectionUITypes,
    kwargCols,
  );
  const userCodeInfoMaps = await getUserCodeInfoMaps(userId);
  const projectConfigCodeInfoMaps = await getProjectConfigCodeInfoMaps(
    projectConfig.id,
  );

  // put top-level initialPosition into sections
  setSectionPositions(sections, sectionPositions);

  return {
    project,
    projectConfig,
    sectionConfigCol,
    sections,
    sectionChildren,
    sectionConfigs,
    ev,
    evCols,
    kwargCols,
    uiTypes: { ...baseUITypes, ...presetUITypes, ...sectionUITypes },
    uiTypeCols,
    codeInfo,
    userCodeInfoMaps,
    projectConfigCodeInfoMaps,
  };
}
