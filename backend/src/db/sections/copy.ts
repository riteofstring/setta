import { ManySectionTypeSaveProjectToBackend } from 'abcde-utils/src/types/section';
import { remapIds } from 'src/utils/utils';

export function copySections({
  sections,
  codeInfoIdMap,
  evColIdMap,
  uiTypeIdMap,
  uiTypeColIdMap,
}: {
  sections: ManySectionTypeSaveProjectToBackend;
  codeInfoIdMap;
  evColIdMap;
  uiTypeIdMap;
  uiTypeColIdMap;
}) {
  const { newIds: newSections, idMap: sectionIdMap } = remapIds(sections);
  for (const section of Object.values(newSections)) {
    section.id = sectionIdMap[section.id];
    section.children = section.children.map((x) => sectionIdMap[x]);
    if (section.paramInfoId) {
      section.paramInfoId =
        codeInfoIdMap[section.paramInfoId] ?? section.paramInfoId;
    }
    section.evColId = evColIdMap[section.evColId] ?? section.evColId;
    section.uiTypeId = uiTypeIdMap[section.uiTypeId] ?? section.uiTypeId;
    section.uiTypeColId =
      uiTypeColIdMap[section.uiTypeColId] ?? section.uiTypeColId;
    section.nonPresetUITypeIds = section.nonPresetUITypeIds.map(
      (x) => uiTypeIdMap[x] ?? x,
    );
  }
  return { newSections, sectionIdMap };
}
