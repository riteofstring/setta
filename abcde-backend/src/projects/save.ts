import { saveAllProjectConfigCodeInfoMaps } from 'src/codeInfoMaps/save';
import { saveEV, saveEVCols } from 'src/enteredValues/save';
import { saveKwargCols, saveKwargInfo } from 'src/kwargs/save';
import { prisma } from 'src/prisma';
import { saveProjectConfig } from 'src/projectConfigs/save';
import {
  saveSectionConfigCol,
  saveSectionConfigs,
  saveSections,
} from 'src/sections/save';
import { saveUITypeCols, saveUITypes } from 'src/uiTypes/save';

export async function saveMultipleProjectDetails(user, projects) {
  for (const p of projects) {
    await saveProjectDetails(user, p, false);
  }
  // save project info afterward, to ensure defaultconfigid is a valid foreign key
  for (const p of projects) {
    await saveProject(user, p.project, p.projectConfig.id);
  }
}

export async function saveProjectDetails(user, p, doSaveProject = true) {
  await saveKwargInfo(p.kwargInfo);
  await saveKwargCols(p.kwargCols);
  await saveSections(p.sections, p.sectionChildren);
  await saveEV(p.ev);
  await saveEVCols(p.evCols);
  await saveUITypes(user, p.uiTypes);
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
    await saveProject(user, p.project, p.projectConfig.id);
  }
}

export async function saveProject(user, project, projectConfigId) {
  const data = {
    id: project.id,
    name: project.name,
    ownerId: user.id,
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

export async function createProject(user, name: string) {
  const defaultConfig = await prisma.projectConfig.create({
    data: {
      name: 'config1',
      sectionConfigCol: { create: {} },
      sectionChildren: { create: {} },
    },
  });

  const project = await prisma.project.create({
    data: {
      owner: { connect: { id: user.id } },
      name,
      defaultConfig: { connect: { id: defaultConfig.id } },
      configs: { connect: [{ id: defaultConfig.id }] },
    },
    include: { configs: true },
  });

  return project;
}
