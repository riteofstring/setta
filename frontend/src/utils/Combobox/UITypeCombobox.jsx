import {
  useAvailableUITypesForParam,
  useAvailableUITypesForSection,
} from "hooks/usePresetUIType";
import _ from "lodash";
import { IdNameCombobox } from "./IdNameCombobox";

function UITypeCombobox({ onDropdownSelect, selectedId, availableUITypes }) {
  const grouped = _.groupBy(availableUITypes, "displayType");
  const groupedAsList = Object.keys(grouped).map((k) => ({
    group: k,
    items: grouped[k],
  }));

  return (
    <IdNameCombobox
      allItems={groupedAsList}
      initialSelection={selectedId}
      onSelectedItemChange={onDropdownSelect}
      position="absolute"
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
