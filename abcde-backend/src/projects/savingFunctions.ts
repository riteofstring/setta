import _ = require('lodash');
import { PrismaClient } from '@prisma/client';
import { saveKwargInfo } from 'src/codeInfo/savingFunctions';
import {
  copyEV,
  copyEVCols,
  saveEV,
  saveEVCols,
} from 'src/enteredValues/savingFunctions';
import { saveKwargCols } from 'src/kwargs/savingFunctions';
import {
  copySectionConfigCol,
  copySectionConfigs,
  saveSectionChildren,
  saveSectionConfigCol,
  saveSectionConfigs,
  saveSections,
} from 'src/sections/savingFunctions';
import { saveUITypeCols, saveUITypes } from 'src/uiTypes/savingFunctions';

export async function saveMultipleProjectDetails(
  prisma: PrismaClient,
  projects,
) {
  for (const p of projects) {
    await saveProjectDetails(prisma, p, false);
  }
  // save project info afterward, to ensure defaultconfigid is a valid foreign key
  for (const p of projects) {
    await saveProject(prisma, p.project, p.projectConfig);
  }
}

export async function saveProjectDetails(
  prisma: PrismaClient,
  p,
  saveProjectInfo = true,
) {
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
  await saveProjectConfig(prisma, p.projectConfig, p.sections);
  if (saveProjectInfo) {
    await saveProject(prisma, p.project, p.projectConfig);
  }
}

export async function saveProjectConfig(
  prisma: PrismaClient,
  config,
  sections,
) {
  const { id, name, sectionConfigCol, children, childrenId } = config;
  const sectionPositions = _.mapValues(sections, (x) => x.initialPosition);
  await prisma.sectionChildrenId.createMany({
    data: [{ id: childrenId }],
    skipDuplicates: true,
  });
  await saveSectionChildren(
    prisma,
    { null: children },
    { null: childrenId },
    { null: sectionPositions },
  );

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

export async function saveProject(
  prisma: PrismaClient,
  project,
  projectConfig,
) {
  const data = {
    id: project.id,
    name: project.name,
    ownerId: project.ownerId,
    defaultConfigId: project.defaultConfigId,
  };
  await prisma.project.upsert({
    where: { id: data.id },
    create: data,
    update: data,
  });
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

async function copyProjectConfig(
  prisma: PrismaClient,
  projectConfig,
  newConfigName,
  newSectionConfigColId,
  sections,
) {
  const { id, ...newProjectConfig } = projectConfig;
  newProjectConfig['name'] = newConfigName;
  newProjectConfig['sectionConfigCol'] = newSectionConfigColId;

  console.log('newProjectConfig', newProjectConfig);
  // await saveProjectConfig(prisma, newProjectConfig, sections);
}

export async function saveAsNewProjectConfig(
  prisma: PrismaClient,
  project,
  newConfigName: string,
) {
  const { projectConfig, ev, evCols, sectionConfigs, sectionConfigCol } =
    project;
  const evIdMap = await copyEV(prisma, ev);
  const evColIdIdMap = await copyEVCols(prisma, evCols, evIdMap);
  const sectionConfigIdMap = await copySectionConfigs(
    prisma,
    sectionConfigs,
    evColIdIdMap,
  );
  const newSectionConfigColId = await copySectionConfigCol(
    prisma,
    sectionConfigCol,
    sectionConfigIdMap,
  );
  await copyProjectConfig(
    prisma,
    projectConfig,
    newConfigName,
    newSectionConfigColId,
    project.sections,
  );

  // console.log('newConfigName', newConfigName);
  // console.log('ev', ev);
  // console.log('evCols', evCols);
}
