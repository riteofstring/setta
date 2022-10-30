import _ = require('lodash');
import { PrismaClient } from '@prisma/client';
import { saveCodeInfo } from '../codeInfo/savingFunctions';
import { saveKwargCols } from '../kwargs/savingFunctions';

export async function saveAllProjectDetails(prisma: PrismaClient, p) {
  await saveCodeInfo(prisma, p.kwargInfo);
  await saveKwargCols(prisma, p.kwargCols);
  // await persistKwargCols(em, p.kwargCols);
  // await persistSections(em, p.sections, p.sectionChildrenIds);
  // await persistSectionChildren(em, p.sectionChildren, p.sectionChildrenIds);
  // await persistEV(em, p.ev);
  // await persistEVCols(em, p.evCols);
  // await persistUITypes(em, p.uiTypes);
  // await persistUITypesCols(em, p.uiTypesCols);
  // await persistProjectConfig(em, p.projectConfig);
  // await persistProject(em, p.project);
  // await connectProjectToProjectConfig(em, p.project, p.projectConfig);
  // await persistSectionConfigs(em, p.sectionConfigs);
  // await persistSectionConfigCol(
  //   em,
  //   p.sectionConfigCol,
  //   p.projectConfig.sectionConfigCol,
  // );
}

// export async function persistProject(em, project) {
//   const { id, ...assign } = project;
//   const findBy = { id };
//   await createIfNotFound(em, Projects, findBy, assign);
// }

// export async function persistProjectConfig(em, config) {
//   const { id, name, sectionConfigCol, children, childrenId } = config;
//   await createIfNotFound(em, SectionConfigColsIds, {
//     id: sectionConfigCol,
//   });
//   await createIfNotFound(em, SectionChildrenIds, { id: childrenId });
//   await persistOneSectionChildren(em, children, childrenId);
//   const findBy = { id };
//   const assign = { name, sectionConfigCol, children: childrenId };
//   await createIfNotFound(em, ProjectConfigs, findBy, assign);
// }

// export async function connectProjectToProjectConfig(
//   em,
//   project,
//   projectConfig,
// ) {
//   const x = await em.findOne(ProjectConfigs, { id: projectConfig.id });
//   x.project = project.id;
//   em.persist(x);
// }
