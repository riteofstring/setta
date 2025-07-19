import { useNonPresetImplsForParam } from "state/hooks/presetUITypes";
import { IdNameCombobox } from "./IdNameCombobox";

function UITypeCombobox({
  nonPresetImpls,
  presetImpls,
  onDropdownSelect,
  selectedBaseImplId,
}) {
  const allItems = [
    { group: "Base", items: nonPresetImpls },
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
  const nonPresetImpls = useNonPresetImplsForParam(sectionId, paramInfoId);
  return (
    <UITypeCombobox
      nonPresetImpls={nonPresetImpls}
      presetImpls={presetCodeObjImpls}
      selectedBaseImplId={selectedBaseImplId}
      onDropdownSelect={onDropdownSelect}
    />
  );
}
