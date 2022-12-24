import { ProjectType } from 'abcde-utils/src/types/project';
import { saveAllProjectConfigCodeInfoMaps } from 'src/db/codeInfoMaps/save';
import { saveEV, saveEVCols } from 'src/db/enteredValues/save';
import { saveKwargCols, saveKwargInfo } from 'src/db/kwargs/save';
import { prisma } from 'src/db/prisma';
import { saveProjectConfig } from 'src/db/projectConfigs/save';
import {
  saveSectionConfigCol,
  saveSectionConfigs,
  saveSections,
} from 'src/db/sections/save';
import { saveUITypeCols, saveUITypes } from 'src/db/uiTypes/save';

export async function saveMultipleProjectDetails(userId, projects) {
  for (const p of projects) {
    await saveProjectDetails(userId, p, false);
  }
  // save project info afterward, to ensure defaultconfigid is a valid foreign key
  for (const p of projects) {
    await saveProject(userId, p.project, p.projectConfig.id);
  }
}

export async function saveProjectDetails(userId, p, doSaveProject = true) {
  await saveKwargInfo(p.kwargInfo);
  await saveKwargCols(p.kwargCols);
  await saveSections(p.sections, p.sectionChildren);
  await saveEV(p.ev);
  await saveEVCols(p.evCols);
  await saveUITypes(userId, p.uiTypes);
  await saveUITypeCols(p.uiTypeCols);
  await saveSectionConfigs(p.sectionConfigs);
  await saveSectionConfigCol(
    p.sectionConfigCol,
    p.projectConfig.sectionConfigCol,
  );
  await saveProjectConfig(p.projectConfig, p.sections);
  await saveAllProjectConfigCodeInfoMaps(
    p.projectConfig.id,
    p.projectConfigCodeInfoMaps,
  );

  if (doSaveProject) {
    await saveProject(userId, p.project, p.projectConfig.id);
  }
}

export async function saveProject(
  userId,
  project: ProjectType,
  projectConfigId,
) {
  const data = {
    id: project.id,
    name: project.name,
    ownerId: userId,
    defaultConfigId: project.defaultConfigId,
  };
  await prisma.project.upsert({
    where: { id: data.id, ownerId: data.ownerId },
    create: data,
    update: data,
  });
  await prisma.projectConfig.update({
    where: { id: projectConfigId },
    data: { projectId: project.id },
  });
}

export async function createProject(userId, name: string) {
  const defaultConfig = await prisma.projectConfig.create({
    data: {
      name: 'config1',
      sectionConfigCol: { create: {} },
      sectionChildren: { create: {} },
    },
  });

  const project = await prisma.project.create({
    data: {
      owner: { connect: { id: userId } },
      name,
      defaultConfig: { connect: { id: defaultConfig.id } },
      configs: { connect: [{ id: defaultConfig.id }] },
    },
    include: { configs: true },
  });

  return project;
}
