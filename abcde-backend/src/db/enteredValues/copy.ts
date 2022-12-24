import { ManyEVType } from 'abcde-utils/src/types/ev';
import { createIdMap, renameKeys } from 'src/utils/utils';
import { EVColType } from './types';

export function copyEV(ev: ManyEVType) {
  const oldIds = Object.keys(ev);
  const evIdMap = createIdMap(oldIds);
  const newEv = renameKeys(ev, evIdMap);
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
