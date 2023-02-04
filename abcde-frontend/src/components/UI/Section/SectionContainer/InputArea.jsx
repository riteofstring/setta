import { useIsInfo } from "hooks/useSectionType";
import { setSelectedItem } from "thunks/sections/sections";
import { ParamGroupContainer } from "./Main/Group/GroupContainer";
import { KwargsControls } from "./Main/KwargsControls/KwargsControls";
import { SectionSearch } from "./Main/Search/Search";
import { SectionDescription } from "./Main/SectionDescription/SectionDescription";

export function InputArea({ sectionId, selectedItem }) {
  function onSelectedItemChange(value) {
    setSelectedItem(sectionId, value);
  }
  const isInfo = useIsInfo(sectionId);

  return isInfo ? (
    <SectionDescription sectionId={sectionId} card={true} />
  ) : (
    <>
      <SectionSearch
        sectionId={sectionId}
        initialSelection={selectedItem}
        onSelectedItemChange={onSelectedItemChange}
      />

      <KwargsControls sectionId={sectionId} objInfoId={selectedItem} />
      <ParamGroupContainer sectionId={sectionId} objInfoId={selectedItem} />
    </>
  );
}
