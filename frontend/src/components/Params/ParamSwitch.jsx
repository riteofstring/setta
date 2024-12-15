import _ from "lodash";
import React from "react";
import { getOnMouseDownSelectParamFn } from "state/actions/paramSelect";
import { getDisplayedCodeInfoCol } from "state/actions/sectionInfos";
import { useSectionInfos } from "state/definitions";
import { ParamContainer } from "./ParamContainer";
import { ParamNameInput } from "./ParamItems/ParamNameInput";
import { ParamTextLabel } from "./ParamItems/ParamTextLabel";

function _ParamSwitch(props) {
  const { sectionId, paramInfoId, ancestorIsSelected } = props;

  const { isKwarg, paramChildren } = useSectionInfos((x) => {
    const codeInfoChildren = getDisplayedCodeInfoCol(sectionId, x).children;
    return {
      isKwarg: x.codeInfo[paramInfoId].editable,
      paramChildren: codeInfoChildren[paramInfoId] ?? [],
    };
  }, _.isEqual);

  const hasChildren = paramChildren.length > 0;
  const onMouseDown = hasChildren
    ? getOnMouseDownSelectParamFn(ancestorIsSelected, sectionId, paramInfoId)
    : undefined;

  return (
    <ParamContainer {...props} paramChildren={paramChildren}>
      {isKwarg ? (
        <ParamNameInput
          sectionId={sectionId}
          paramInfoId={paramInfoId}
          hasChildren={hasChildren}
          onMouseDown={onMouseDown}
        />
      ) : (
        <ParamTextLabel
          paramInfoId={paramInfoId}
          onMouseDown={onMouseDown}
        />
      )}
    </ParamContainer>
  );
}

export const ParamSwitch = React.memo(_ParamSwitch);
