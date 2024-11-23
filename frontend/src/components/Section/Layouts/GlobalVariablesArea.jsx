import { SectionYamlView } from "components/Params/YamlView";
import React from "react";
import { ParamGroupContainer } from "../../Params/GroupContainer";
import { KwargsControls } from "../SectionParts/KwargsControls";
import { useShowYaml } from "./toYaml";

function _GlobalVariablesArea({ sectionId, bgColor }) {
  const showYaml = useShowYaml(sectionId);

  return !showYaml ? (
    <>
      <KwargsControls
        sectionId={sectionId}
        objInfoId={null}
        bgColor={bgColor}
      />
      <ParamGroupContainer sectionId={sectionId} />
    </>
  ) : (
    <SectionYamlView sectionId={sectionId} />
  );
}

export const GlobalVariablesArea = React.memo(_GlobalVariablesArea);
