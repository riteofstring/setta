import { EntityManager } from '@mikro-orm/core';
import { Seeder } from '@mikro-orm/seeder';
import { Projects } from '../../src/entities/projects.entity';
import projectsData from '../../../abcde-frontend/src/__tests__data/Projects';
import { Sections } from '../../src/entities/sections/sections.entity';
import { SectionConfigColsIds } from '../../src/entities/sections/sectionConfigColsIds.entity';
import { SectionConfigCols } from '../../src/entities/sections/sectionConfigCols.entity';
import { UITypes } from '../../src/entities/uitypes/uiTypes.entity';
import { CodeInfo } from '../../src/entities/codeInfo.entity';
import { EVColsIds } from '../../src/entities/enteredValues/evColsIds.entity';
import { loadAllSections } from '../utils';

export class ProjectsSeeder extends Seeder {
  async run(em: EntityManager): Promise<void> {
    // create projects and section configs
    for (const x of Object.values(projectsData)) {
      em.create(SectionConfigColsIds, { id: x.sectionConfigCol });
      em.create(Projects, x);

      // find section group
      const sectionGroup = await em.findOne(
        Sections,
        { id: x.sectionGroup },
        { populate: ['children'] },
      );

      const allSections = loadAllSections();
      // create a section config for each section in the section group
      for (const section of sectionGroup.children) {
        const {
          selectedItem: sid,
          uiTypeId,
          paramCollectionId,
        } = allSections[section.id];
        const selectedItem = await em.findOne(CodeInfo, { id: sid });
        const uiType = await em.findOne(UITypes, { id: uiTypeId });
        const evCol = await em.findOne(EVColsIds, { id: paramCollectionId });

        em.create(SectionConfigCols, {
          id: x.sectionConfigCol,
          section,
          evCol,
          selectedItem,
          sectionType: uiType,
        });
      }
    }
  }
}
