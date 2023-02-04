import { setSelectedItem } from "thunks/sections/sections";
import {
  KwargGroupContainer,
  ParamGroupContainer,
} from "./Main/Group/GroupContainer";
import { SectionSearch } from "./Main/Search/Search";
import { SectionDescription } from "./Main/SectionDescription/SectionDescription";

export function InputArea({ sectionId, selectedItem, isRoot }) {
  function onSelectedItemChange(value) {
    setSelectedItem(sectionId, value);
  }

  // TODO: determine tempBoolDesc dynamically
  const tempBoolDesc = true;
  return (
    !isRoot && (
      <>
        {tempBoolDesc && (
          <SectionDescription sectionId={sectionId} card={true} />
        )}
        <SectionSearch
          sectionId={sectionId}
          initialSelection={selectedItem}
          onSelectedItemChange={onSelectedItemChange}
        />

        <ParamGroupContainer sectionId={sectionId} objInfoId={selectedItem} />
        <KwargGroupContainer sectionId={sectionId} objInfoId={selectedItem} />
      </>
    )
  );
}
