import React from "react";
import { ParamGroupContainer } from "../../Params/GroupContainer";
import { KwargsControls } from "../SectionParts/KwargsControls";

function _DictArea({ sectionId, bgColor }) {
  //   const showYaml = useShowYaml(sectionId);

  return (
    <>
      <KwargsControls sectionId={sectionId} bgColor={bgColor} />
      <ParamGroupContainer sectionId={sectionId} />
      {/* {!!showYaml && <SectionYamlView sectionId={sectionId} />} */}
    </>
  );
}

export const DictArea = React.memo(_DictArea);
