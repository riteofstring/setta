import { useGetSectionConfig } from "hooks/useSectionConfig";
import React from "react";
import { setSelectedItem } from "thunks/sections/sections";
import { ParamGroupContainer } from "./Main/Group/GroupContainer";
import { KwargsControls } from "./Main/KwargsControls/KwargsControls";
import { SectionSearch } from "./Main/Search/Search";

function _InputArea({ sectionId }) {
  const selectedItem = useGetSectionConfig(sectionId, "selectedItem");

  function onSelectedItemChange(value) {
    setSelectedItem(sectionId, value);
  }

  return (
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
