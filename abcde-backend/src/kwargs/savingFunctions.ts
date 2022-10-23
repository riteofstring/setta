import _ = require('lodash');
import { KwargColsIds } from '../entities/kwargs/kwargColsIds.entity';
import { KwargCols } from '../entities/kwargs/kwargCols.entity';
import { createIfNotFound } from '../utils/utils';

export async function persistKwargCols(em, kwargsCols) {
  for (const kwargColId of Object.keys(kwargsCols)) {
    await createIfNotFound(em, KwargColsIds, {
      id: kwargColId,
    });
    for (const codeInfoId of _.keys(kwargsCols[kwargColId])) {
      const assign = {
        id: kwargColId,
        codeInfo: codeInfoId === 'null' ? null : codeInfoId,
        kwargInfos: kwargsCols[kwargColId][codeInfoId],
      };
      console.log(assign);
      await em.upsert(KwargCols, assign);
    }
  }
}
