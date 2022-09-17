import { EntityManager } from '@mikro-orm/core';
import { Seeder } from '@mikro-orm/seeder';
import { Sections } from '../../src/entities/sections.entity';
import data from '../../../abcde-frontend/src/__tests__data/simpleTrainTest/UI';

export class SectionsSeeder extends Seeder {
  async run(em: EntityManager): Promise<void> {
    for (const x of Object.values(data.sections)) {
      em.create(Sections, { id: x.id, name: x.name });
    }
  }
}
