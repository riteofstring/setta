import { ManyUITypeType } from 'abcde-utils/src/types/uiType';
import { ManyUITypeColType } from 'abcde-utils/src/types/uiTypeCol';
import { remapIds, renameKeys } from 'src/utils/utils';

export function copyUITypes(uiTypes: ManyUITypeType) {
  const { newIds: newUITypes, idMap: uiTypeIdMap } = remapIds(uiTypes);

  for (const u of Object.values(newUITypes)) {
    u.id = uiTypeIdMap[u.id] ?? u.id;
  }

  return { newUITypes, uiTypeIdMap };
}

export function copyUITypeCols({
  uiTypeCols,
  uiTypeIdMap,
  codeInfoIdMap,
}: {
  uiTypeCols: ManyUITypeColType;
  uiTypeIdMap;
  codeInfoIdMap;
}) {
  const { newIds: newUITypeCols, idMap: uiTypeColIdMap } = remapIds(uiTypeCols);

  for (const id of Object.keys(newUITypeCols)) {
    newUITypeCols[id] = renameKeys(newUITypeCols[id], codeInfoIdMap);
    const col = newUITypeCols[id];
    for (const [codeInfoId, u] of Object.entries(col)) {
      if (u.uiTypeId in uiTypeIdMap) {
        col[codeInfoId].uiTypeId = uiTypeIdMap[u.uiTypeId];
      }
      col[codeInfoId].nonPresetUITypeIds = col[
        codeInfoId
      ].nonPresetUITypeIds.map((x) => uiTypeIdMap[x] ?? x);
    }
  }

  return { newUITypeCols, uiTypeColIdMap };
}
