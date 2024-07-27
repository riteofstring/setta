import React from "react";
import { useGetSectionInfo } from "state/hooks/sections";
import { ParamGroupContainer } from "../../Section/SectionContainer/Main/Group/GroupContainer";
import { KwargsControls } from "../../Section/SectionContainer/Main/KwargsControls/KwargsControls";
import { SectionSearch } from "../../Section/SectionContainer/Main/Search/Search";

function _InputArea({ sectionId }) {
  const selectedItem = useGetSectionInfo(sectionId, "selectedItem");

  return (
    <>
      <SectionSearch sectionId={sectionId} initialSelection={selectedItem} />
      <KwargsControls sectionId={sectionId} objInfoId={selectedItem} />
      <ParamGroupContainer sectionId={sectionId} objInfoId={selectedItem} />
    </>
  );
}

export const InputArea = React.memo(_InputArea);
