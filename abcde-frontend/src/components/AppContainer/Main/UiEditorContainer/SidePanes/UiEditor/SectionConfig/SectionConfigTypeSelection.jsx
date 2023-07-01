import { useGetSectionInfo } from "hooks/useSectionInfo";
import { setSectionUITypeId } from "thunks/uiTypes/setSectionUITypeId";
import { SectionUITypeCombobox } from "utils/Combobox/UITypeCombobox";

export function SectionConfigTypeSelection({ sectionId }) {
  const selectedId = useGetSectionInfo(sectionId, "uiTypeId");

  const onDropdownSelect = (e) => {
    if (e && e !== selectedId) {
      setSectionUITypeId({ uiTypeId: e, sectionId, incrementVersion: true });
    }
  };

  return (
    <SectionUITypeCombobox
      sectionId={sectionId}
      onDropdownSelect={onDropdownSelect}
      selectedId={selectedId}
    />
  );
}
