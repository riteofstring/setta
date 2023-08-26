import { ManyEVColType } from 'abcde-utils/src/types/evCol';
import { remapIds, renameKeys } from 'src/utils/utils';

export function copyEVCols({
  evCols,
  codeInfoIdMap,
}: {
  evCols: ManyEVColType;
  codeInfoIdMap;
}) {
  const { newIds: newEvCols, idMap: evColIdMap } = remapIds(evCols);

  // replace kwargInfo ids
  for (const id of Object.keys(newEvCols)) {
    newEvCols[id] = renameKeys(newEvCols[id], codeInfoIdMap);
  }

  return { newEvCols, evColIdMap };
}
