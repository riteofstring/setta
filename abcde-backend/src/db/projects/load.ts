import { ProjectLoadType } from 'abcde-utils/src/types/projectSaveLoad';
import _ from 'lodash';
import { getCodeInfoForSectionsAndKwargs } from 'src/db/codeInfo/load';
import { getProjectConfigCodeInfoMaps } from 'src/db/codeInfoMaps/projectConfig/load';
import { getUserCodeInfoMaps } from 'src/db/codeInfoMaps/user/load';
import { prisma } from 'src/db/prisma';
import { getProjectConfig } from 'src/db/projectConfigs/load';
import { getSections, setSectionPositions } from 'src/db/sections/load';
import { getBaseUITypes, getPresetUITypes } from 'src/db/uiTypes/load';
import { getRuns } from '../runs/load';

async function getIds({ username, projectName, configName }) {
  const config = await prisma.projectConfig.findFirstOrThrow({
    where: {
      name: configName,
      project: { name: projectName, owner: { name: username } },
    },
    select: { id: true, projectId: true },
  });
  return { projectId: config.projectId, configId: config.id };
}

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

export async function loadOne({
  reqUserId,
  username,
  projectName,
  configName,
}): Promise<ProjectLoadType> {
  const { projectId, configId } = await getIds({
    username,
    projectName,
    configName,
  });

  const project = await getProject(projectId);
  const { projectConfig, sectionPositions } = await getProjectConfig(configId);
  const { sections, ev, evCols, kwargCols, uiTypeCols, sectionUITypes } =
    await getSections(projectConfig.children);

  const baseUITypes = await getBaseUITypes();
  const presetUITypes = await getPresetUITypes(reqUserId);
  const codeInfo = await getCodeInfoForSectionsAndKwargs(
    sectionUITypes,
    kwargCols,
  );
  const userCodeInfoMaps = await getUserCodeInfoMaps(reqUserId);
  const projectConfigCodeInfoMaps = await getProjectConfigCodeInfoMaps(
    projectConfig.id,
  );
  const { outputGroups, outputs } = await getRuns(configId);

  // put top-level initialPosition into sections
  setSectionPositions(sections, sectionPositions);

  return {
    project,
    projectConfig,
    sections,
    ev,
    evCols,
    kwargCols,
    uiTypes: { ...baseUITypes, ...presetUITypes, ...sectionUITypes },
    uiTypeCols,
    codeInfo,
    userCodeInfoMaps,
    projectConfigCodeInfoMaps,
    outputGroups,
    outputs,
  };
}
