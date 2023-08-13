import { useGetSectionInfo } from "hooks/useSectionInfo";
import React from "react";
import { ParamGroupContainer } from "./Main/Group/GroupContainer";
import { KwargsControls } from "./Main/KwargsControls/KwargsControls";
import { SectionSearch } from "./Main/Search/Search";

function _InputArea({ sectionId, isGlobalVariables }) {
  const selectedItem = useGetSectionInfo(sectionId, "selectedItem");

  return (
    <>
      <SectionSearch
        sectionId={sectionId}
        initialSelection={selectedItem}
        inputClasses="px-6"
      />

      <KwargsControls
        sectionId={sectionId}
        objInfoId={selectedItem}
        isGlobalVariables={isGlobalVariables}
      />
      <ParamGroupContainer sectionId={sectionId} objInfoId={selectedItem} />
    </>
  );
}

export const InputArea = React.memo(_InputArea);
