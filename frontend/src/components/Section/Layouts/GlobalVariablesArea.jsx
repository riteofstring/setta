import { YamlView } from "components/Params/YamlView";
import React from "react";
import { ParamGroupContainer } from "../../Params/GroupContainer";
import { KwargsControls } from "../SectionParts/KwargsControls";
import { useShowYaml } from "./toYaml";

function _GlobalVariablesArea({ sectionId, bgColor }) {
  const { showYaml, yamlValue, setYamlValue } = useShowYaml(sectionId);

  console.log("showYaml", showYaml, yamlValue)

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
    <YamlView
      sectionId={sectionId}
      yamlValue={yamlValue}
      setYamlValue={setYamlValue}
    />
  );
}

export const GlobalVariablesArea = React.memo(_GlobalVariablesArea);
