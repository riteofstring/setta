import { ManySectionTypeSaveProjectToBackend } from 'abcde-utils/src/types/section';
import { remapIds } from 'src/utils/utils';

export function copySections({
  sections,
  kwargColIdMap,
  evColIdMap,
  uiTypeIdMap,
  uiTypeColIdMap,
}: {
  sections: ManySectionTypeSaveProjectToBackend;
  kwargColIdMap;
  evColIdMap;
  uiTypeIdMap;
  uiTypeColIdMap;
}) {
  const { newIds: newSections, idMap: sectionIdMap } = remapIds(sections);
  for (const section of Object.values(newSections)) {
    section.id = sectionIdMap[section.id];
    section.children = section.children.map((x) => sectionIdMap[x]);
    section.kwargColId =
      kwargColIdMap[section.kwargColId] ?? section.kwargColId;
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
