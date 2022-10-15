import _ = require('lodash');
import { createIfNotFound } from '../utils/utils';
import { KwargColsIds } from '../../src/entities/kwargs/kwargColsIds.entity';
import { KwargCols } from '../../src/entities/kwargs/kwargCols.entity';

export async function persistKwargCols(em, kwargsCols) {
  for (const kwargColId of Object.keys(kwargsCols)) {
    await createIfNotFound(em, KwargColsIds, {
      id: kwargColId,
    });
    for (const codeInfoId of _.keys(kwargsCols[kwargColId])) {
      const findBy = {
        id: kwargColId,
        codeInfo: codeInfoId === 'null' ? null : codeInfoId,
      };
      const assign = {
        kwargInfos: kwargsCols[kwargColId][codeInfoId],
      };
      await createIfNotFound(em, KwargCols, findBy, assign);
    }
  }
}
