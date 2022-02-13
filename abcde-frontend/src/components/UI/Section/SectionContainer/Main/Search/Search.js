import { useGetObjInfos } from "hooks/useSectionContents";
import _ from "lodash";
import React, { useState } from "react";
import { ComboboxSearch } from "utils/Combobox/ComboboxSearch";

export default function SectionSearch({
  sectionId,
  onSelectedItemChange,
  initialSelection,
}) {
  const objInfos = useGetObjInfos(sectionId);
  //to avoid uncontrolled --> controlled warning
  const init = _.find(objInfos, { id: initialSelection });
  const [selection, setSelection] = useState(init ? init : "");
  const [items, setItems] = useState([]);
  const [inputItems, setInputItems] = useState([]);

  const itemToString = (x) => {
    return x.name;
  };

  const onClick = () => {
    setItems(objInfos);
    setInputItems(objInfos);
  };

  const localOnSelectedItemChange = ({ selectedItem }) => {
    if (selectedItem) {
      const sid = selectedItem.id;
      if (sid !== selection?.id) {
        setSelection(selectedItem);
      }
      onSelectedItemChange(sid);
    }
  };

  return (
    <ComboboxSearch
      items={items}
      inputItems={inputItems}
      selectedItem={selection}
      itemToString={itemToString}
      setInputItems={setInputItems}
      onClick={onClick}
      onSelectedItemChange={localOnSelectedItemChange}
    />
  );
}
