import { ManyEVType } from 'abcde-utils/src/types/ev';
import { ManyEVColType } from 'abcde-utils/src/types/evCol';
import { remapIds, renameKeys } from 'src/utils/utils';

export function copyEV(ev: ManyEVType) {
  const { newIds: newEv, idMap: evIdMap } = remapIds(ev);
  return { newEv, evIdMap };
}

export function copyEVCols({
  evCols,
  evIdMap,
  kwargInfoIdMap,
}: {
  evCols: ManyEVColType;
  evIdMap;
  kwargInfoIdMap;
}) {
  const { newIds: newEvCols, idMap: evColIdMap } = remapIds(evCols);

  // replace ev ids
  for (const id of Object.keys(newEvCols)) {
    newEvCols[id] = renameKeys(newEvCols[id], kwargInfoIdMap);
    const col = newEvCols[id];
    for (const [codeInfoId, evId] of Object.entries(col)) {
      if (evId in evIdMap) {
        col[codeInfoId] = evIdMap[evId];
      }
    }
  }

  return { newEvCols, evColIdMap };
}
