import React from "react";
import { useGetSectionInfo } from "state/hooks/sections";
import { ParamGroupContainer } from "../Params/GroupContainer";
import { KwargsControls } from "../SectionParts/KwargsControls";
import { SectionSearch } from "../SectionParts/Search";

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
