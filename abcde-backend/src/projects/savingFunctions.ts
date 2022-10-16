import { Projects } from '../entities/projects/projects.entity';
import { ProjectConfigs } from '../entities/projects/projectConfigs.entity';
import {
  persistSectionChildren,
  persistSectionConfigCols,
  persistSectionConfigs,
  persistSections,
} from '../sections/savingFunctions';
import { persistEV, persistEVCols } from '../enteredValues/savingFunctions';
import { persistUITypes, persistUITypesCols } from '../uiTypes/savingFunctions';
import { persistKwargCols } from '../kwargs/savingFunctions';
import { persistCodeInfo } from '../codeInfo/savingFunctions';
import _ = require('lodash');
import { createIfNotFound } from '../utils/utils';
import { SectionConfigColsIds } from '../entities/sections/sectionConfigColsIds.entity';

// em = entityManager
// p = object that contains project info
export async function persistAllProjectDetails(em, p) {
  await persistCodeInfo(em, p.kwargInfo);
  await persistKwargCols(em, p.kwargCols);
  await persistSections(em, p.sections, p.sectionChildrenIds);
  await persistSectionChildren(em, p.sectionChildren, p.sectionChildrenIds);
  await persistEV(em, p.ev);
  await persistEVCols(em, p.evCols);
  await persistUITypes(em, p.uiTypes);
  await persistUITypesCols(em, p.uiTypesCols);
  await persistSectionConfigs(em, p.sectionConfigs);
  await persistSectionConfigCols(em, p.sectionConfigCols);
  await persistProjectConfig(em, p.projectConfig);
  await persistProject(em, p.project);
  await connectProjectToProjectConfig(em, p.project, p.projectConfig);
}

export async function persistProject(em, project) {
  const { id, ...assign } = project;
  const findBy = { id };
  await createIfNotFound(em, Projects, findBy, assign);
}

export async function persistProjectConfig(em, config) {
  const { id, name, sectionConfigCol } = config;
  await createIfNotFound(em, SectionConfigColsIds, {
    id: sectionConfigCol,
  });

  const findBy = { id };
  const assign = { name, sectionConfigCol };
  await createIfNotFound(em, ProjectConfigs, findBy, assign);
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
