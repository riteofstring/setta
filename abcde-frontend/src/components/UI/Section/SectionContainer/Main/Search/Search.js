import { useGetObjInfos } from "hooks/useSectionContents";
import React from "react";
import { IdNameCombobox } from "utils/Combobox/IdNameCombobox";

export default function SectionSearch({
  sectionId,
  onSelectedItemChange,
  initialSelection,
}) {
  const objInfos = useGetObjInfos(sectionId);
  return (
    <IdNameCombobox
      allItems={objInfos}
      onSelectedItemChange={onSelectedItemChange}
      initialSelection={initialSelection}
    />
  );
}
