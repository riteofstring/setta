import { EntityManager } from '@mikro-orm/core';
import { Seeder } from '@mikro-orm/seeder';
import KwargColsData from '../../../abcde-frontend/src/__tests__data/simpleTrainTest/KwargCols';
import _ = require('lodash');
import { createIfNotFound } from '../utils';
import { KwargColsIds } from '../../src/entities/kwargs/kwargColsIds.entity';
import { KwargCols } from '../../src/entities/kwargs/kwargCols.entity';

export class KwargColsSeeder extends Seeder {
  async run(em: EntityManager): Promise<void> {
    for (const kwargColId of Object.keys(KwargColsData)) {
      await createIfNotFound(em, KwargColsIds, {
        id: kwargColId,
      });
      const curr = KwargColsData[kwargColId];
      _.forEach(curr, (v, k) => {
        const props = { id: kwargColId, codeInfo: k, kwargInfos: v };
        if (k === 'null') {
          props.codeInfo = null;
        }
        em.create(KwargCols, props);
      });
    }
  }
}
