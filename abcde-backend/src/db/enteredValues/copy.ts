import { ManyEVType } from 'abcde-utils/src/types/ev';
import { ManyEVColType } from 'abcde-utils/src/types/evCol';
import { remapIds } from 'src/utils/utils';

export function copyEV(ev: ManyEVType) {
  const { newIds: newEv, idMap: evIdMap } = remapIds(ev);
  return { newEv, evIdMap };
}

export function copyEVCols(evCols: ManyEVColType, evIdMap) {
  const { newIds: newEvCols, idMap: evColIdMap } = remapIds(evCols);

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
