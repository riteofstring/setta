import { EV } from '../entities/enteredValues/ev.entity';
import { EVCols } from '../entities/enteredValues/evCols.entity';
import { EVColsIds } from '../entities/enteredValues/evColsIds.entity';
import { createIfNotFound, returnNullNotUndefined } from '../utils/utils';
import _ = require('lodash');

export async function persistEV(em, ev) {
  for (const evId of _.keys(ev)) {
    const v = ev[evId];
    const findBy = { id: evId };
    const assign = {
      value: v.value ? v.value.toString() : null,
      child: returnNullNotUndefined(v.childId),
    };
    await createIfNotFound(em, EV, findBy, assign);
  }
}

export async function persistEVCols(em, evCols) {
  for (const evColId of _.keys(evCols)) {
    await createIfNotFound(em, EVColsIds, { id: evColId });
    for (const codeInfoId of _.keys(evCols[evColId])) {
      const findBy = {
        id: evColId,
        codeInfo: codeInfoId,
      };
      const assign = {
        enteredValue: evCols[evColId][codeInfoId].enteredValueId,
      };
      await createIfNotFound(em, EVCols, findBy, assign);
    }
  }
}
