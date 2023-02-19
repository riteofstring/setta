import { useGetSectionConfig } from "hooks/useSectionConfig";
import { useIsInfo } from "hooks/useSectionType";
import React from "react";
import { setSelectedItem } from "thunks/sections/sections";
import { ParamGroupContainer } from "./Main/Group/GroupContainer";
import { KwargsControls } from "./Main/KwargsControls/KwargsControls";
import { SectionSearch } from "./Main/Search/Search";
import { SectionDescription } from "./Main/SectionDescription/SectionDescription";

function _InputArea({ sectionId }) {
  const selectedItem = useGetSectionConfig(sectionId, "selectedItem");

  function onSelectedItemChange(value) {
    setSelectedItem(sectionId, value);
  }
  const isInfo = useIsInfo(sectionId);

  return isInfo ? (
    <SectionDescription sectionId={sectionId} card={true} />
  ) : (
    <>
      <div className="px-6">
        <SectionSearch
          sectionId={sectionId}
          initialSelection={selectedItem}
          onSelectedItemChange={onSelectedItemChange}
        />
      </div>

      <KwargsControls sectionId={sectionId} objInfoId={selectedItem} />
      <ParamGroupContainer sectionId={sectionId} objInfoId={selectedItem} />
    </>
  );
}

export const InputArea = React.memo(_InputArea);
