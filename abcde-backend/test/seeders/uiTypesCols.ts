import { EntityManager } from '@mikro-orm/core';
import { Seeder } from '@mikro-orm/seeder';
import { UITypesCols } from '../../src/entities/uiTypes/uiTypesCols.entity';
import { UITypesColsIds } from '../../src/entities/uiTypes/uiTypesColsIds.entity';
import UITypeColsData from '../../../abcde-frontend/src/__tests__data/simpleTrainTest/UITypesCols';
import _ = require('lodash');
import { createIfNotFound } from '../utils';

export class UITypesColsSeeder extends Seeder {
  async run(em: EntityManager): Promise<void> {
    for (const uiTypeColId of Object.keys(UITypeColsData)) {
      await createIfNotFound(em, UITypesColsIds, {
        id: uiTypeColId,
      });
      const curr = UITypeColsData[uiTypeColId];
      _.forEach(curr, (v) =>
        em.create(UITypesCols, {
          id: uiTypeColId,
          codeInfo: v.id,
          uiType: v.uiTypeId,
        }),
      );
    }
  }
}
