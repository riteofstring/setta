import { isBasePreset, isUserPreset } from "abcde-utils/src/uiTypeConstants";
import {
  useAvailableUITypesForNestedSection,
  useAvailableUITypesForTopLevelSection,
  useAvailableUITypesForUIConfig,
} from "hooks/usePresetUIType";
import _ from "lodash";
import { IdNameCombobox } from "utils/Combobox/IdNameCombobox";

function UITypeCombobox({ onDropdownSelect, selectedId, availableUITypes }) {
  function itemStyleGetter(item) {
    if (isUserPreset(item)) {
      return "font-bold italic text-green-700";
    } else if (isBasePreset(item)) {
      return "font-bold text-blue-500";
    } else {
      return "text-slate-500";
    }
  }

  const grouped = _.groupBy(availableUITypes, "presetType");
  const groupedAsList = Object.keys(grouped).map((k) => ({
    group: k,
    items: grouped[k],
  }));

  return (
    <IdNameCombobox
      allItems={groupedAsList}
      initialSelection={selectedId}
      onSelectedItemChange={onDropdownSelect}
      itemStyleGetter={itemStyleGetter}
    />
  );
}

export function TopLevelSectionUITypeCombobox({
  sectionId,
  selectedId,
  ...props
}) {
  const availableUITypes = useAvailableUITypesForTopLevelSection(
    sectionId,
    selectedId
  );
  return (
    <UITypeCombobox
      availableUITypes={availableUITypes}
      selectedId={selectedId}
      {...props}
    />
  );
}

export function NestedSectionUITypeCombobox({
  sectionId,
  selectedId,
  ...props
}) {
  const availableUITypes = useAvailableUITypesForNestedSection(
    sectionId,
    selectedId
  );
  return (
    <UITypeCombobox
      availableUITypes={availableUITypes}
      selectedId={selectedId}
      {...props}
    />
  );
}

export function UIConfigUITypeCombobox({
  sectionId,
  paramInfoId,
  selectedId,
  ...props
}) {
  const availableUITypes = useAvailableUITypesForUIConfig(
    sectionId,
    paramInfoId,
    selectedId
  );
  return (
    <UITypeCombobox
      availableUITypes={availableUITypes}
      selectedId={selectedId}
      {...props}
    />
  );
}
