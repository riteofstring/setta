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

// em = entityManager
// p = object that contains project info
export async function persistAllProjectDetails(em, p) {
  await persistCodeInfo(em, p.kwargInfos);
  await persistKwargCols(em, p.kwargCols);

  await persistSections(em, p.sections);
  await persistSectionChildren(em, p.sectionChildren);

  await persistEV(em, p.ev);
  await persistEVCols(em, p.evCols);

  await persistUITypes(em, p.uiTypes);
  await persistUITypesCols(em, p.uiTypesCols);

  await persistSectionConfigs(em, p.sectionConfigs);
  await persistSectionConfigCols(em, p.sectionConfigCols);

  await persistProjectConfigs(em, p.projectConfigs);
  await persistProjects(em, p.projects);
}

export async function persistProjects(em, projects) {
  for (const x of _.values(projects)) {
    const findBy = { id: x.id };
    const assign = {
      name: x.name,
      owner: x.owner,
      configs: x.configs,
      defaultConfig: x.defaultConfig,
    };
    await createIfNotFound(em, Projects, findBy, assign);
  }
}

export async function persistProjectConfigs(em, projectConfigs) {
  for (const x of _.values(projectConfigs)) {
    const findBy = { id: x.id };
    const assign = { name: x.name, sectionConfigCol: x.sectionConfigCol };
    await createIfNotFound(em, ProjectConfigs, findBy, assign);
  }
}
