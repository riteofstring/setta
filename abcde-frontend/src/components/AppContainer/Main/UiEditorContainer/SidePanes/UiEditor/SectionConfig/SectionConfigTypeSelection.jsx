import { useIsTopLevelSection } from "hooks/useProjectConfig";
import { useGetSectionConfig } from "hooks/useSectionConfig";
import { setSectionUITypeId } from "thunks/uiTypes";
import {
  NestedSectionUITypeCombobox,
  TopLevelSectionUITypeCombobox,
} from "utils/Combobox/UITypeCombobox";

export function SectionConfigTypeSelection({ sectionId }) {
  const selectedId = useGetSectionConfig(sectionId, "uiTypeId");
  const isTopLevel = useIsTopLevelSection(sectionId);

  const onDropdownSelect = (e) => {
    if (e && e !== selectedId) {
      setSectionUITypeId({ uiTypeId: e, sectionId });
    }
  };

  return isTopLevel ? (
    <TopLevelSectionUITypeCombobox
      sectionId={sectionId}
      onDropdownSelect={onDropdownSelect}
      selectedId={selectedId}
    />
  ) : (
    <NestedSectionUITypeCombobox
      sectionId={sectionId}
      onDropdownSelect={onDropdownSelect}
      selectedId={selectedId}
    />
  );
}
