import { EntityManager } from '@mikro-orm/core';
import { Seeder } from '@mikro-orm/seeder';
import { UIs } from '../../src/entities/uis.entity';
import { Projects } from '../../src/entities/projects.entity';
import data from '../../../abcde-frontend/src/__tests__data/simpleTrainTest/UIs';

export class UIsSeeder extends Seeder {
  async run(em: EntityManager): Promise<void> {
    for (const x of data) {
      const project = await em.findOne(Projects, { ...x.project });
      const newUI = em.create(UIs, x);
      project.uis.add(newUI);
    }
  }
}
