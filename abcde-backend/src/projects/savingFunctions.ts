import { PrismaClient } from '@prisma/client';
import * as _ from 'lodash';
import { saveKwargInfo } from 'src/codeInfo/savingFunctions';
import { saveAllProjectConfigCodeInfoMaps } from 'src/codeInfoMaps/savingFunctions';
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
import { createNewId, renameKeys } from 'src/utils/utils';

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

async function assembleProjectConfig(prisma: PrismaClient, config, sections) {
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

  return {
    id,
    name,
    sectionConfigColId: sectionConfigCol,
    sectionChildrenId: childrenId,
  };
}

export async function saveProjectConfig(
  prisma: PrismaClient,
  config,
  sections,
) {
  const data = await assembleProjectConfig(prisma, config, sections);
  await prisma.projectConfig.upsert({
    where: { id: data.id },
    create: data,
    update: data,
  });
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

function copyProjectConfig({
  projectConfig,
  newConfigName = null,
  doCreateNewId = true,
}) {
  const newProjectConfig = _.cloneDeep(projectConfig);
  const newVals = {
    sectionConfigCol: createNewId(),
    childrenId: createNewId(),
  };
  if (newConfigName) {
    newVals['name'] = newConfigName;
  }
  if (doCreateNewId) {
    newVals['id'] = createNewId();
  }
  Object.assign(newProjectConfig, newVals);
  return newProjectConfig;
}

export async function saveAsNewProjectConfig(
  prisma: PrismaClient,
  user,
  project,
  newConfigName: string,
) {
  const projectToSave = copyProjectDetails(project);
  projectToSave.projectConfig = copyProjectConfig({
    projectConfig: projectToSave.projectConfig,
    newConfigName,
  });
  await saveProjectDetails(prisma, user, projectToSave);
  return projectToSave;
}

export async function saveAsExistingProjectConfig(
  prisma: PrismaClient,
  user,
  project,
  configId: string,
) {
  const projectToSave = copyProjectDetails(project);
  let existingProjectConfig = await prisma.projectConfig.findUnique({
    where: { id: configId },
  });
  existingProjectConfig = renameKeys(existingProjectConfig, {
    sectionConfigColId: 'sectionConfigCol',
    sectionChildrenId: 'childrenId',
  });
  existingProjectConfig['children'] = projectToSave.projectConfig.children;
  delete existingProjectConfig.projectId;
  projectToSave.projectConfig = copyProjectConfig({
    projectConfig: existingProjectConfig,
    doCreateNewId: false,
  });
  await saveProjectDetails(prisma, user, projectToSave);
  return projectToSave;
}

function copyProjectDetails(project) {
  const { ev, evCols, sectionConfigs, sectionConfigCol, ...theRest } = project;

  const { newEv, evIdMap } = copyEV(ev);
  const { newEvCols, evColIdMap } = copyEVCols(evCols, evIdMap);
  const { newSectionConfigs, sectionConfigIdMap } = copySectionConfigs(
    sectionConfigs,
    evColIdMap,
  );
  const newSectionConfigCol = copySectionConfigCol(
    sectionConfigCol,
    sectionConfigIdMap,
  );

  return {
    ...theRest,
    ev: newEv,
    evCols: newEvCols,
    sectionConfigs: newSectionConfigs,
    sectionConfigCol: newSectionConfigCol,
  };
}
