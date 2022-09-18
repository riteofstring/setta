import { EntityManager } from '@mikro-orm/core';
import { Seeder } from '@mikro-orm/seeder';
import { Projects } from '../../src/entities/projects.entity';
import data from '../../../abcde-frontend/src/__tests__data/Projects';
import sectionGroups from '../../../abcde-frontend/src/__tests__data/SectionGroups';
import { Sections } from '../../src/entities/sections/sections.entity';
import { SectionConfigColsIds } from '../../src/entities/sections/sectionConfigColsIds.entity';
import { SectionConfigCols } from '../../src/entities/sections/sectionConfigCols.entity';

export class ProjectsSeeder extends Seeder {
  async run(em: EntityManager): Promise<void> {
    for (const x of sectionGroups) {
      em.create(Sections, x);
    }
    for (const x of data) {
      em.create(SectionConfigColsIds, { id: x.sectionConfigCol });
      em.create(Projects, x);

      const sectionGroup = await em.findOne(
        Sections,
        { id: x.sectionGroup },
        { populate: ['children'] },
      );
      for (const section of sectionGroup.children) {
        em.create(SectionConfigCols, { id: x.sectionConfigCol, section });
      }
    }
  }
}
