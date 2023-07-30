import { ManyEVColType } from 'abcde-utils/src/types/evCol';
import { remapIds, renameKeys } from 'src/utils/utils';

export function copyEVCols({
  evCols,
  kwargInfoIdMap,
}: {
  evCols: ManyEVColType;
  kwargInfoIdMap;
}) {
  const { newIds: newEvCols, idMap: evColIdMap } = remapIds(evCols);

  // replace kwargInfo ids
  for (const id of Object.keys(newEvCols)) {
    newEvCols[id] = renameKeys(newEvCols[id], kwargInfoIdMap);
  }

  return { newEvCols, evColIdMap };
}
