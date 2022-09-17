import { EntityManager } from '@mikro-orm/core';
import { Seeder } from '@mikro-orm/seeder';
import { UITypes } from '../../src/entities/uitypes/uiTypes.entity';
import { SectionUITypes } from '../../src/entities/uiTypes/sectionUITypes.entity';
import simpleTrainTest from '../../../abcde-frontend/src/__tests__data/simpleTrainTest/UI';
import { CodeInfo } from '../../src/entities/codeInfo.entity';

export class UITypesSeeder extends Seeder {
  async run(em: EntityManager): Promise<void> {
    for (const x of Object.values(simpleTrainTest.uiTypes)) {
      const baseType = em.create(UITypes, x);

      const collectionIds = x.config.collections;
      const collections = em.create(CodeInfo, {
        name: '',
        type: 'collection',
        children: collectionIds,
      });
      em.create(SectionUITypes, { id: baseType, collections });
    }
  }
}
