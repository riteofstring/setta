import React from "react";
import { useGetSectionInfo } from "state/hooks/sections";
import { SectionSearch } from "../SectionParts/Search";

function _ReferenceArea({ sectionId }) {
  const selectedItem = useGetSectionInfo(sectionId, "selectedItem");

  return (
    <SectionSearch sectionId={sectionId} initialSelection={selectedItem} />
  );
}

export const ReferenceArea = React.memo(_ReferenceArea);
