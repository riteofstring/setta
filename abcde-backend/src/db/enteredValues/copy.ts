import { createIdMap, renameKeys } from 'src/utils/utils';
import { EVColType, EVType } from './types';

export function copyEV(ev: EVType) {
  const oldIds = Object.keys(ev);
  const evIdMap = createIdMap(oldIds);
  const newEv = renameKeys(ev, evIdMap);
  for (const [newId, x] of Object.entries(newEv)) {
    x.id = newId;
  }
  return { newEv, evIdMap };
}

export function copyEVCols(evCols: EVColType, evIdMap) {
  const oldIds = Object.keys(evCols);
  const evColIdMap = createIdMap(oldIds);
  const newEvCols = renameKeys(evCols, evColIdMap);

  // replace ev ids
  for (const newEvCol of Object.values(newEvCols)) {
    for (const [codeInfoId, evId] of Object.entries(newEvCol)) {
      if (evId in evIdMap) {
        newEvCol[codeInfoId] = evIdMap[evId];
      }
    }
  }

  return { newEvCols, evColIdMap };
}
