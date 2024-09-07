import { YamlView } from "components/Params/YamlView";
import React from "react";
import { useGetSectionInfo } from "state/hooks/sections";
import { useSectionSelectedItem } from "state/hooks/sectionVariants";
import { ParamGroupContainer } from "../../Params/GroupContainer";
import { KwargsControls } from "../SectionParts/KwargsControls";
import { SectionSearch } from "../SectionParts/Search";

function _InputArea({ sectionId }) {
  const selectedItem = useSectionSelectedItem(sectionId);
  const hideSearch = useGetSectionInfo(sectionId, "hideSearch");
  const hideParams = useGetSectionInfo(sectionId, "hideParams");
  const showYaml = useGetSectionInfo(sectionId, "showYaml");

  return (
    <>
      {!hideSearch && (
        <SectionSearch sectionId={sectionId} selectedItem={selectedItem} />
      )}
      {!showYaml && !hideParams && (
        <>
          <KwargsControls sectionId={sectionId} objInfoId={selectedItem} />
          <ParamGroupContainer sectionId={sectionId} objInfoId={selectedItem} />
        </>
      )}
      {showYaml && <YamlView sectionId={sectionId} />}
    </>
  );
}

export const InputArea = React.memo(_InputArea);
