import { EntityManager } from '@mikro-orm/core';
import { Seeder } from '@mikro-orm/seeder';
import { Sections } from '../../src/entities/sections/sections.entity';
import simpleTrainTest from '../../../abcde-frontend/src/__tests__data/simpleTrainTest/UI';
import ui from '../../../abcde-frontend/src/__tests__data/simpleTrainTest/UI';
import { UITypes } from '../../src/entities/uitypes/uiTypes.entity';

export class SectionsSeeder extends Seeder {
  async run(em: EntityManager): Promise<void> {
    for (const x of Object.values(simpleTrainTest.sections)) {
      em.create(Sections, x);
    }

    // update uitype origin ids
    for (const x of Object.values(ui.uiTypes)) {
      if (!x.originInfoId.sectionId) {
        continue;
      }
      const uiType = await em.findOne(UITypes, { id: x.id });
      uiType.originSection = await em.findOne(Sections, {
        id: x.originInfoId.sectionId,
      });
    }
  }
}
