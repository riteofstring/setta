import _ = require('lodash');
import { PrismaClient } from '@prisma/client';
import { saveKwargInfo } from '../codeInfo/savingFunctions';
import { saveKwargCols } from '../kwargs/savingFunctions';
import {
  saveSectionChildren,
  saveSections,
  saveSectionConfigs,
  saveSectionConfigCol,
} from '../sections/savingFunctions';
import { saveEV, saveEVCols } from '../enteredValues/savingFunctions';
import { saveUITypeCols, saveUITypes } from '../uiTypes/savingFunctions';

export async function saveAllProjectDetails(prisma: PrismaClient, p) {
  await saveKwargInfo(prisma, p.kwargInfo);
  await saveKwargCols(prisma, p.kwargCols);
  await saveSections(prisma, p.sections, p.sectionChildrenIds);
  await saveSectionChildren(prisma, p.sectionChildren, p.sectionChildrenIds);
  await saveEV(prisma, p.ev);
  await saveEVCols(prisma, p.evCols);
  await saveUITypes(prisma, p.uiTypes);
  await saveUITypeCols(prisma, p.uiTypesCols);
  await saveSectionConfigs(prisma, p.sectionConfigs);
  await saveSectionConfigCol(
    prisma,
    p.sectionConfigCol,
    p.projectConfig.sectionConfigCol,
  );
  await saveProjectConfig(prisma, p.projectConfig);

  // await persistProject(em, p.project);
  // await connectProjectToProjectConfig(em, p.project, p.projectConfig);
}

// export async function persistProject(em, project) {
//   const { id, ...assign } = project;
//   const findBy = { id };
//   await createIfNotFound(em, Projects, findBy, assign);
// }

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

// export async function connectProjectToProjectConfig(
//   em,
//   project,
//   projectConfig,
// ) {
//   const x = await em.findOne(ProjectConfigs, { id: projectConfig.id });
//   x.project = project.id;
//   em.persist(x);
// }
