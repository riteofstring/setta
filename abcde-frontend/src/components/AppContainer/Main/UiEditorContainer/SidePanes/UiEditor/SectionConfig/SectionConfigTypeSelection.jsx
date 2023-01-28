import { useIsTopLevelSection } from "hooks/useProjectConfig";
import {
  NestedSectionUITypeCombobox,
  TopLevelSectionUITypeCombobox,
} from "utils/Combobox/UITypeCombobox";

export default function SectionConfigTypeSelection({
  onDropdownSelect,
  selectedId,
  sectionId,
}) {
  const isTopLevel = useIsTopLevelSection(sectionId);

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
