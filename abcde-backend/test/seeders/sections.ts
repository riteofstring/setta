import { EntityManager } from '@mikro-orm/core';
import { Seeder } from '@mikro-orm/seeder';
import { Sections } from '../../src/entities/sections.entity';
import simpleTrainTest from '../../../abcde-frontend/src/__tests__data/simpleTrainTest/UI';
import sectionGroups from '../../../abcde-frontend/src/__tests__data/SectionGroups';

export class SectionsSeeder extends Seeder {
  async run(em: EntityManager): Promise<void> {
    for (const x of Object.values(simpleTrainTest.sections)) {
      let curr = new Sections();
      curr = Object.assign(curr, { id: x.id, name: x.name });
      em.persist(curr);
    }
    em.flush();

    // now add sectionGroups
    for (const x of sectionGroups) {
      em.create(Sections, x);
    }
  }
}
