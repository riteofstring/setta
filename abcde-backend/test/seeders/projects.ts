import { EntityManager } from '@mikro-orm/core';
import { Seeder } from '@mikro-orm/seeder';
import { Projects } from '../../src/entities/projects.entity';
import projectsData from '../../../abcde-frontend/src/__tests__data/Projects';
import { Sections } from '../../src/entities/sections/sections.entity';
import { SectionConfigColsIds } from '../../src/entities/sections/sectionConfigColsIds.entity';
import { SectionConfigCols } from '../../src/entities/sections/sectionConfigCols.entity';
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
      let sectionsToProcess: any = [sectionGroup];

      while (sectionsToProcess.length > 0) {
        const section = sectionsToProcess.pop();

        em.create(SectionConfigCols, {
          id: x.sectionConfigCol,
          section,
          config: allSections[section.id].configId,
        });

        const children = await section.children.init();
        sectionsToProcess = [...sectionsToProcess, ...children];
      }
    }
  }
}
