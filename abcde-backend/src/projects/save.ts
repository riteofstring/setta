import { PrismaClient } from '@prisma/client';
import { saveAllProjectConfigCodeInfoMaps } from 'src/codeInfoMaps/save';
import { saveEV, saveEVCols } from 'src/enteredValues/save';
import { saveKwargCols, saveKwargInfo } from 'src/kwargs/save';
import { saveProjectConfig } from 'src/projectConfigs/save';
import {
  saveSectionConfigCol,
  saveSectionConfigs,
  saveSections,
} from 'src/sections/save';
import { saveUITypeCols, saveUITypes } from 'src/uiTypes/save';

export async function saveMultipleProjectDetails(
  prisma: PrismaClient,
  user,
  projects,
) {
  for (const p of projects) {
    await saveProjectDetails(prisma, user, p, false);
  }
  // save project info afterward, to ensure defaultconfigid is a valid foreign key
  for (const p of projects) {
    await saveProject(prisma, user, p.project, p.projectConfig.id);
  }
}

export async function saveProjectDetails(
  prisma: PrismaClient,
  user,
  p,
  doSaveProject = true,
) {
  await saveKwargInfo(prisma, p.kwargInfo);
  await saveKwargCols(prisma, p.kwargCols);
  await saveSections(prisma, p.sections, p.sectionChildren);
  await saveEV(prisma, p.ev);
  await saveEVCols(prisma, p.evCols);
  await saveUITypes(prisma, user, p.uiTypes);
  await saveUITypeCols(prisma, p.uiTypeCols);
  await saveSectionConfigs(prisma, p.sectionConfigs);
  await saveSectionConfigCol(
    prisma,
    p.sectionConfigCol,
    p.projectConfig.sectionConfigCol,
  );
  await saveProjectConfig(prisma, p.projectConfig, p.sections);
  await saveAllProjectConfigCodeInfoMaps(
    prisma,
    p.projectConfig.id,
    p.projectConfigCodeInfoMaps,
  );

  if (doSaveProject) {
    await saveProject(prisma, user, p.project, p.projectConfig.id);
  }
}

export async function saveProject(
  prisma: PrismaClient,
  user,
  project,
  projectConfigId,
) {
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

export async function createProject(prisma: PrismaClient, user, name: string) {
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
