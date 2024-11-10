import { DropdownWithSectionsInput } from "components/Params/ParamUIs/DropdownInput";
import _ from "lodash";
import {
  useAvailableUITypesForParam,
  useAvailableUITypesForSection,
} from "state/hooks/presetUITypes";

function UITypeCombobox({ onDropdownSelect, selectedId, availableUITypes }) {
  const grouped = _.groupBy(availableUITypes, "displayType");
  const groupedAsList = Object.keys(grouped).map((k) => ({
    name: k,
    children: grouped[k],
  }));

  return (
    <DropdownWithSectionsInput
      choices={groupedAsList}
      value={selectedId}
      onChange={onDropdownSelect}
      // position="absolute"
    />
  );
}

export function SectionUITypeCombobox({ sectionId, selectedId, ...props }) {
  const availableUITypes = useAvailableUITypesForSection(sectionId, selectedId);
  return (
    <UITypeCombobox
      availableUITypes={availableUITypes}
      selectedId={selectedId}
      {...props}
    />
  );
}

export function ParamConfigUITypeCombobox({
  sectionId,
  paramInfoId,
  selectedId,
  ...props
}) {
  const availableUITypes = useAvailableUITypesForParam(
    sectionId,
    paramInfoId,
    selectedId,
  );
  return (
    <UITypeCombobox
      availableUITypes={availableUITypes}
      selectedId={selectedId}
      {...props}
    />
  );
}
