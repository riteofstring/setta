import _ from "lodash";
import React from "react";
import { getCurrEffectiveSectionImplOfType } from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { SectionTypeEnum } from "utils/generatedTypes";
import { ParamGroupContainer } from "../../Params/GroupContainer";
import { KwargsControls } from "../SectionParts/KwargsControls";
import { SectionSearch } from "../SectionParts/Search";

function _CallableArea({ sectionId, bgColor }) {
  const { callable, hideParams } = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImplOfType(
      x,
      sectionId,
      SectionTypeEnum.Callable,
    );
    const { callable, hideParams } = impl;
    return {
      callable,
      hideParams,
    };
  }, _.isEqual);
  // const showYaml = useShowYaml(sectionId);

  return (
    <>
      <SectionSearch sectionId={sectionId} callable={callable} />
      {!hideParams && (
        <>
          <KwargsControls
            sectionId={sectionId}
            objInfoId={callable}
            bgColor={bgColor}
          />
          <ParamGroupContainer sectionId={sectionId} />
        </>
      )}
      {/* {!!showYaml && <SectionYamlView sectionId={sectionId} />} */}
    </>
  );
}

export const CallableArea = React.memo(_CallableArea);
