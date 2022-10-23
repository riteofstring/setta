import { EV } from '../entities/enteredValues/ev.entity';
import { EVCols } from '../entities/enteredValues/evCols.entity';
import { EVColsIds } from '../entities/enteredValues/evColsIds.entity';
import { returnNullNotUndefined } from '../utils/utils';
import _ = require('lodash');

export async function persistEV(em, ev) {
  for (const evId of _.keys(ev)) {
    const v = ev[evId];
    const assign = {
      id: evId,
      value: v.value ? v.value.toString() : null,
      child: returnNullNotUndefined(v.childId),
    };
    await em.upsert(EV, assign);
  }
}

export async function persistEVCols(em, evCols) {
  for (const evColId of _.keys(evCols)) {
    await em.upsert(EVColsIds, { id: evColId });
    for (const codeInfoId of _.keys(evCols[evColId])) {
      const assign = {
        id: evColId,
        codeInfo: codeInfoId,
        enteredValue: evCols[evColId][codeInfoId],
      };
      await em.upsert(EVCols, assign);
    }
  }
}
