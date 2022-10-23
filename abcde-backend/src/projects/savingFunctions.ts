import { Projects } from '../entities/projects/projects.entity';
import { ProjectConfigs } from '../entities/projects/projectConfigs.entity';
import {
  persistOneSectionChildren,
  persistSectionChildren,
  persistSectionConfigCol,
  persistSectionConfigs,
  persistSections,
} from '../sections/savingFunctions';
import { persistEV, persistEVCols } from '../enteredValues/savingFunctions';
import { persistUITypes, persistUITypesCols } from '../uiTypes/savingFunctions';
import { persistKwargCols } from '../kwargs/savingFunctions';
import { persistCodeInfo } from '../codeInfo/savingFunctions';
import { SectionConfigColsIds } from '../entities/sections/sectionConfigColsIds.entity';
import { SectionChildrenIds } from '../entities/sections/sectionChildrenIds.entity';

// em = entityManager
// p = object that contains project info
export async function persistAllProjectDetails(em, p) {
  await persistCodeInfo(em, p.kwargInfo);
  await persistKwargCols(em, p.kwargCols);
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

export async function persistProject(em, project) {
  await em.upsert(Projects, project);
}

export async function persistProjectConfig(em, config) {
  const { id, name, sectionConfigCol, children, childrenId } = config;
  await em.upsert(SectionConfigColsIds, {
    id: sectionConfigCol,
  });
  await em.upsert(SectionChildrenIds, { id: childrenId });
  await persistOneSectionChildren(em, children, childrenId);
  const assign = { id, name, sectionConfigCol, children: childrenId };
  await em.upsert(ProjectConfigs, assign);
}

export async function connectProjectToProjectConfig(
  em,
  project,
  projectConfig,
) {
  const x = await em.findOne(ProjectConfigs, { id: projectConfig.id });
  x.project = project.id;
  em.persist(x);
}
