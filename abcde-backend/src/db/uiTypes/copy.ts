import { ManyUITypeType } from 'abcde-utils/src/types/uiType';
import { ManyUITypeColType } from 'abcde-utils/src/types/uiTypeCol';
import { remapIds } from 'src/utils/utils';

export function copyUITypes(uiTypes: ManyUITypeType) {
  const { newIds: newUITypes, idMap: uiTypeIdMap } = remapIds(uiTypes);

  for (const u of Object.values(newUITypes)) {
    u.id = uiTypeIdMap[u.id] ?? u.id;
  }

  return { newUITypes, uiTypeIdMap };
}

export function copyUITypeCols(uiTypeCols: ManyUITypeColType, uiTypeIdMap) {
  const { newIds: newUITypeCols, idMap: uiTypeColIdMap } = remapIds(uiTypeCols);

  // replace ev ids
  for (const newUITypeCol of Object.values(newUITypeCols)) {
    for (const [codeInfoId, u] of Object.entries(newUITypeCol)) {
      if (u.uiTypeId in uiTypeIdMap) {
        newUITypeCol[codeInfoId].uiTypeId = uiTypeIdMap[u.uiTypeId];
      }
      newUITypeCol[codeInfoId].nonPresetUITypeIds = newUITypeCol[
        codeInfoId
      ].nonPresetUITypeIds.map((x) => uiTypeIdMap[x] ?? x);
    }
  }

  return { newUITypeCols, uiTypeColIdMap };
}
