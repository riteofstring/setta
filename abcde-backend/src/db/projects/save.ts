import { ProjectType } from 'abcde-utils/src/types/project';
import { ProjectSaveType } from 'abcde-utils/src/types/projectSaveLoad';
import { saveAllProjectConfigCodeInfoMaps } from 'src/db/codeInfoMaps/projectConfig/save';
import { saveEV, saveEVCols } from 'src/db/enteredValues/save';
import { saveKwargCols, saveKwargInfo } from 'src/db/kwargs/save';
import { prisma } from 'src/db/prisma';
import { saveProjectConfig } from 'src/db/projectConfigs/save';
import {
  saveSectionConfigCol,
  saveSectionConfigs,
  saveSectionDescriptions,
  saveSections,
} from 'src/db/sections/save';
import { saveUITypeCols, saveUITypes } from 'src/db/uiTypes/save';

export async function saveProjectDetails(userId, p: ProjectSaveType) {
  await saveKwargInfo(p.kwargInfo);
  await saveKwargCols(p.kwargCols);
  await saveSections(p.sections, p.sectionChildren);
  await saveEV(p.ev);
  await saveEVCols(p.evCols);
  await saveUITypes(userId, p.uiTypes);
  await saveUITypeCols(p.uiTypeCols);
  await saveSectionDescriptions(p.sectionDescriptions);
  await saveSectionConfigs(p.sectionConfigs);
  await saveSectionConfigCol(p.sections, p.projectConfig.sectionConfigCol);
  await saveProject(userId, p.project);
  await saveProjectConfig(p.project.id, p.projectConfig, p.sections);
  await saveAllProjectConfigCodeInfoMaps(
    p.projectConfig.id,
    p.projectConfigCodeInfoMaps,
  );
}

export async function saveProject(userId, project: ProjectType) {
  const data = {
    id: project.id,
    name: project.name,
    ownerId: userId,
  };
  await prisma.project.upsert({
    where: { id: data.id, ownerId: data.ownerId },
    create: data,
    update: data,
  });
}

export async function createProject(userId, name: string) {
  const project = await prisma.project.create({
    data: {
      owner: { connect: { id: userId } },
      name,
    },
    include: { configs: true },
  });

  await prisma.projectConfig.create({
    data: {
      name: 'config1',
      sectionConfigCol: { create: {} },
      sectionChildren: { create: {} },
      project: { connect: { id: project.id } },
      isDefault: true,
    },
  });

  return project;
}
