import _ = require('lodash');
import { PrismaClient } from '@prisma/client';
import { saveKwargInfo } from 'src/codeInfo/savingFunctions';
import { saveEV, saveEVCols } from 'src/enteredValues/savingFunctions';
import { saveKwargCols } from 'src/kwargs/savingFunctions';
import {
  saveSectionChildren,
  saveSectionConfigCol,
  saveSectionConfigs,
  saveSections,
} from 'src/sections/savingFunctions';
import { saveUITypeCols, saveUITypes } from 'src/uiTypes/savingFunctions';

export async function saveAllProjectDetails(prisma: PrismaClient, p) {
  await saveKwargInfo(prisma, p.kwargInfo);
  await saveKwargCols(prisma, p.kwargCols);
  await saveSections(prisma, p.sections, p.sectionChildren);
  await saveEV(prisma, p.ev);
  await saveEVCols(prisma, p.evCols);
  await saveUITypes(prisma, p.uiTypes);
  await saveUITypeCols(prisma, p.uiTypeCols);
  await saveSectionConfigs(prisma, p.sectionConfigs);
  await saveSectionConfigCol(
    prisma,
    p.sectionConfigCol,
    p.projectConfig.sectionConfigCol,
  );
  await saveProjectConfig(prisma, p.projectConfig);
  await saveProject(prisma, p.project);
  await connectProjectToProjectConfig(prisma, p.project, p.projectConfig);
}

export async function saveProjectConfig(prisma: PrismaClient, config) {
  const { id, name, sectionConfigCol, children, childrenId } = config;
  await prisma.sectionChildrenId.createMany({
    data: [{ id: childrenId }],
    skipDuplicates: true,
  });
  await saveSectionChildren(prisma, { null: children }, { null: childrenId });

  const data = {
    id,
    name,
    sectionConfigColId: sectionConfigCol,
    sectionChildrenId: childrenId,
  };
  await prisma.projectConfig.upsert({
    where: { id },
    create: data,
    update: data,
  });
}

export async function saveProject(prisma: PrismaClient, project) {
  const data = {
    id: project.id,
    name: project.name,
    ownerId: project.owner,
    defaultConfigId: project.defaultConfig,
  };
  await prisma.project.upsert({
    where: { id: data.id },
    create: data,
    update: data,
  });
}

export async function connectProjectToProjectConfig(
  prisma: PrismaClient,
  project,
  projectConfig,
) {
  await prisma.projectConfig.update({
    where: { id: projectConfig.id },
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
