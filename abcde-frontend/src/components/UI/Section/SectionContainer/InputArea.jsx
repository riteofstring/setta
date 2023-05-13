import { useGetSectionConfig } from "hooks/useSectionConfig";
import React from "react";
import { ParamGroupContainer } from "./Main/Group/GroupContainer";
import { KwargsControls } from "./Main/KwargsControls/KwargsControls";
import { SectionSearch } from "./Main/Search/Search";

function _InputArea({ sectionId }) {
  const selectedItem = useGetSectionConfig(sectionId, "selectedItem");

  return (
    <>
      <div className="px-6">
        <SectionSearch sectionId={sectionId} initialSelection={selectedItem} />
      </div>

      <KwargsControls sectionId={sectionId} objInfoId={selectedItem} />
      <ParamGroupContainer sectionId={sectionId} objInfoId={selectedItem} />
    </>
  );
}

export const InputArea = React.memo(_InputArea);
