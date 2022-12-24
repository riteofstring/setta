import { ManySectionConfigType } from 'abcde-utils/src/types/sectionConfig';
import { SectionConfigColType } from 'abcde-utils/src/types/sectionConfigCol';
import * as _ from 'lodash';
import { createIdMap, renameKeys } from 'src/utils/utils';

export function copySectionConfigs(
  sectionConfigs: ManySectionConfigType,
  evColIdMap,
) {
  const oldIds = Object.keys(sectionConfigs);
  const sectionConfigIdMap = createIdMap(oldIds);
  const newSectionConfigs = renameKeys(sectionConfigs, sectionConfigIdMap);

  for (const curr of Object.values(newSectionConfigs)) {
    curr.id = sectionConfigIdMap[curr.id];
    if (curr.evColId in evColIdMap) {
      curr.evColId = evColIdMap[curr.evColId];
    }
  }
  return { newSectionConfigs, sectionConfigIdMap };
}

export function copySectionConfigCol(
  sectionConfigCol: SectionConfigColType,
  sectionConfigIdMap,
) {
  const newSectionConfigCol = _.cloneDeep(sectionConfigCol);
  for (const [sectionId, configId] of Object.entries(newSectionConfigCol)) {
    if (configId in sectionConfigIdMap) {
      newSectionConfigCol[sectionId] = sectionConfigIdMap[configId];
    }
  }
  return newSectionConfigCol;
}
