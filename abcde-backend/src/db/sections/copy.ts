import { ManySectionTypeSaveProjectToBackend } from 'abcde-utils/src/types/section';
import _ from 'lodash';

export function copySections(
  sections: ManySectionTypeSaveProjectToBackend,
  evColIdMap,
) {
  const newSections = _.cloneDeep(sections);
  for (const section of Object.values(newSections)) {
    if (section.evColId in evColIdMap) {
      section.evColId = evColIdMap[section.evColId];
    }
  }
  return newSections;
}
