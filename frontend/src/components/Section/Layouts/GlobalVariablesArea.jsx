import { YamlView } from "components/Params/YamlView";
import React from "react";
import { useGetSectionInfo } from "state/hooks/sections";
import { ParamGroupContainer } from "../../Params/GroupContainer";
import { KwargsControls } from "../SectionParts/KwargsControls";

function _GlobalVariablesArea({ sectionId }) {
  const showYaml = useGetSectionInfo(sectionId, "showYaml");

  return !showYaml ? (
    <>
      <KwargsControls sectionId={sectionId} objInfoId={null} />
      <ParamGroupContainer sectionId={sectionId} objInfoId={null} />
    </>
  ) : (
    <YamlView sectionId={sectionId} />
  );
}

export const GlobalVariablesArea = React.memo(_GlobalVariablesArea);
