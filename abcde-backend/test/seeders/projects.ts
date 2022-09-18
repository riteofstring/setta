import { EntityManager } from '@mikro-orm/core';
import { Seeder } from '@mikro-orm/seeder';
import { Projects } from '../../src/entities/projects.entity';
import data from '../../../abcde-frontend/src/__tests__data/Projects';
import sectionGroups from '../../../abcde-frontend/src/__tests__data/SectionGroups';
import simpleTrainTest from '../../../abcde-frontend/src/__tests__data/simpleTrainTest/UI';
import { Sections } from '../../src/entities/sections/sections.entity';
import { SectionConfigColsIds } from '../../src/entities/sections/sectionConfigColsIds.entity';
import { SectionConfigCols } from '../../src/entities/sections/sectionConfigCols.entity';
import { UITypes } from '../../src/entities/uitypes/uiTypes.entity';

export class ProjectsSeeder extends Seeder {
  async run(em: EntityManager): Promise<void> {
    // create section groups
    for (const x of sectionGroups) {
      em.create(Sections, x);
    }

    // create projects and section configs
    for (const x of data) {
      em.create(SectionConfigColsIds, { id: x.sectionConfigCol });
      em.create(Projects, x);

      // find section group
      const sectionGroup = await em.findOne(
        Sections,
        { id: x.sectionGroup },
        { populate: ['children'] },
      );

      // create a section config for each section in the section group
      for (const section of sectionGroup.children) {
        const uiTypeId = simpleTrainTest.sections[section.id].uiTypeId;
        const uiType = await em.findOne(UITypes, { id: uiTypeId });

        em.create(SectionConfigCols, {
          id: x.sectionConfigCol,
          section,
          sectionType: uiType,
        });
      }
    }
  }
}
