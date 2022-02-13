import { useGetObjInfos } from "hooks/useSectionContents";
import _ from "lodash";
import React from "react";
import { ComboboxSearch } from "utils/Combobox/ComboboxSearch";

export default function SectionSearch({
  sectionId,
  onSelectedItemChange,
  initialSelectedItem,
}) {
  const objInfos = useGetObjInfos(sectionId);
  //to avoid uncontrolled --> controlled warning
  const init = _.find(objInfos, { id: initialSelectedItem });
  const initialSelection = init ? init : {};
  const itemToString = (x) => (x ? x.name : "");

  const localOnSelectedItemChange = (
    currSelectedItem,
    newSelectedItem,
    setSelection
  ) => {
    if (newSelectedItem) {
      const sid = newSelectedItem.id;
      if (sid !== currSelectedItem?.id) {
        setSelection(newSelectedItem);
      }
      onSelectedItemChange(sid);
    }
  };

  return (
    <ComboboxSearch
      allItems={objInfos}
      initialSelection={initialSelection}
      itemToString={itemToString}
      onSelectedItemChange={localOnSelectedItemChange}
      matchSorterProps={{ keys: ["name"] }}
    />
  );
}
