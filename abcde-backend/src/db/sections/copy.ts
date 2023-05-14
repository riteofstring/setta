import { ManySectionTypeSaveProjectToBackend } from 'abcde-utils/src/types/section';
import { ManySectionConfigType } from 'abcde-utils/src/types/sectionConfig';
import _ from 'lodash';
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

export function copySections(
  sections: ManySectionTypeSaveProjectToBackend,
  sectionConfigIdMap,
) {
  const newSections = _.cloneDeep(sections);
  for (const section of Object.values(newSections)) {
    if (section.configId in sectionConfigIdMap) {
      section.configId = sectionConfigIdMap[section.configId];
    }
  }
  return newSections;
}
