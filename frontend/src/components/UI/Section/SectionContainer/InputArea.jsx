import { useGetSectionInfo } from "hooks/useSectionInfo";
import React from "react";
import { ParamGroupContainer } from "./Main/Group/GroupContainer";
import { KwargsControls } from "./Main/KwargsControls/KwargsControls";
import { SectionSearch } from "./Main/Search/Search";

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
