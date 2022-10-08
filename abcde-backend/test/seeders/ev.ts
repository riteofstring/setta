import { EntityManager } from '@mikro-orm/core';
import { Seeder } from '@mikro-orm/seeder';
import { EV } from '../../src/entities/enteredValues/ev.entity';
import { EVCols } from '../../src/entities/enteredValues/evCols.entity';
import { EVColsIds } from '../../src/entities/enteredValues/evColsIds.entity';
import EVData from '../../../abcde-frontend/src/__tests__data/simpleTrainTest/EV';
import EVColsData from '../../../abcde-frontend/src/__tests__data/simpleTrainTest/EVCols';
import _ = require('lodash');

export class EVSeeder extends Seeder {
  async run(em: EntityManager): Promise<void> {
    for (const k of Object.keys(EVData)) {
      // Can't do childId here. Have to wait for sections to be created
      em.create(EV, { id: k, value: EVData[k].value });
    }
    for (const evColId of Object.keys(EVColsData)) {
      const curr = EVColsData[evColId];
      em.create(EVColsIds, { id: evColId });
      _.forEach(curr, (v) =>
        em.create(EVCols, {
          id: evColId,
          codeInfo: v.id,
          enteredValue: v.enteredValueId,
        }),
      );
    }
  }
}
