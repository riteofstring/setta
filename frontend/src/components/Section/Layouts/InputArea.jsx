import React from "react";
import { useGetSectionInfo } from "state/hooks/sections";
import { useSectionSelectedItem } from "state/hooks/sectionVariants";
import { ParamGroupContainer } from "../../Params/GroupContainer";
import { KwargsControls } from "../SectionParts/KwargsControls";
import { SectionSearch } from "../SectionParts/Search";

function _InputArea({ sectionId, bgColor }) {
  const selectedItem = useSectionSelectedItem(sectionId);
  const hideSearch = useGetSectionInfo(sectionId, "hideSearch");
  const hideParams = useGetSectionInfo(sectionId, "hideParams");

  return (
    <>
      {!hideSearch && (
        <SectionSearch sectionId={sectionId} selectedItem={selectedItem} />
      )}
      {!hideParams && (
        <>
          <KwargsControls
            sectionId={sectionId}
            objInfoId={selectedItem}
            bgColor={bgColor}
          />
          <ParamGroupContainer sectionId={sectionId} objInfoId={selectedItem} />
        </>
      )}
    </>
  );
}

export const InputArea = React.memo(_InputArea);
