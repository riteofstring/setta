import { ManyCodeInfoType } from 'abcde-utils/src/types/codeInfo';
import { ManyKwargColType } from 'abcde-utils/src/types/kwargCol';
import { remapIds } from 'src/utils/utils';

export function copyKwargInfo(kwargInfo: ManyCodeInfoType) {
  const { newIds: newKwargInfo, idMap: kwargInfoIdMap } = remapIds(kwargInfo);

  for (const k of Object.values(newKwargInfo)) {
    k.id = kwargInfoIdMap[k.id] ?? k.id;
  }

  return { newKwargInfo, kwargInfoIdMap };
}

export function copyKwargCols(kwargCols: ManyKwargColType, kwargInfoIdMap) {
  const { newIds: newKwargCols, idMap: kwargColIdMap } = remapIds(kwargCols);

  // replace kwargInfo ids
  for (const newKwargCol of Object.values(newKwargCols)) {
    for (const codeInfoId of Object.keys(newKwargCol)) {
      newKwargCol[codeInfoId] = newKwargCol[codeInfoId].map(
        (x) => kwargInfoIdMap[x] ?? x,
      );
    }
  }

  return { newKwargCols, kwargColIdMap };
}
