import { EntityManager } from '@mikro-orm/core';
import { Seeder } from '@mikro-orm/seeder';
import {
  loadAllEV,
  loadAllEVCols,
  loadAllKwargCols,
  loadAllKwargInfos,
  loadAllProjectConfigs,
  loadAllProjects,
  loadAllSectionChildren,
  loadAllSectionChildrenIds,
  loadAllSectionConfigCols,
  loadAllSectionConfigs,
  loadAllSections,
  loadAllUITypes,
  loadAllUITypesCols,
} from '../utils';
import { persistAllProjectDetails } from '../../src/projects/savingFunctions';

export class ProjectSeeder extends Seeder {
  async run(em: EntityManager): Promise<void> {
    const kwargInfos = loadAllKwargInfos();
    const kwargCols = loadAllKwargCols();

    const sections = loadAllSections();
    const sectionChildren = loadAllSectionChildren();
    const sectionChildrenIds = loadAllSectionChildrenIds();

    const ev = loadAllEV();
    const evCols = loadAllEVCols();

    const uiTypes = loadAllUITypes();
    const uiTypesCols = loadAllUITypesCols();

    const sectionConfigs = loadAllSectionConfigs();
    const sectionConfigCols = loadAllSectionConfigCols();

    const projectConfigs = loadAllProjectConfigs();
    const projects = loadAllProjects();

    await persistAllProjectDetails(em, {
      kwargInfos,
      kwargCols,
      sections,
      sectionChildren,
      sectionChildrenIds,
      ev,
      evCols,
      uiTypes,
      uiTypesCols,
      sectionConfigs,
      sectionConfigCols,
      projectConfigs,
      projects,
    });
  }
}
