import { useAvailableUITypesForParam } from "state/hooks/presetUITypes";
import { IdNameCombobox } from "./IdNameCombobox";

function UITypeCombobox({
  baseImpls,
  presetImpls,
  onDropdownSelect,
  selectedBaseImplId,
}) {
  const allItems = [
    { group: "Base", items: baseImpls },
    { group: "Preset", items: presetImpls },
  ];

  return (
    <IdNameCombobox
      allItems={allItems}
      value={selectedBaseImplId}
      onSelectedItemChange={onDropdownSelect}
    />
  );
}

export function ParamConfigUITypeCombobox({
  sectionId,
  paramInfoId,
  selectedBaseImplId,
  presetCodeObjImpls,
  onDropdownSelect,
}: {
  sectionId: string;
  paramInfoId: string;
  selectedBaseImplId: string;
  presetCodeObjImpls: Array<{ id: string; name: string }>;
  onDropdownSelect: any;
}) {
  const baseImpls = useAvailableUITypesForParam(sectionId, paramInfoId);
  return (
    <UITypeCombobox
      baseImpls={baseImpls}
      presetImpls={presetCodeObjImpls}
      selectedBaseImplId={selectedBaseImplId}
      onDropdownSelect={onDropdownSelect}
    />
  );
}
