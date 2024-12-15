import _ from "lodash";
import React, { useCallback } from "react";
import { toggleParamSelected } from "state/actions/kwargs";
import { getDisplayedCodeInfoCol } from "state/actions/sectionInfos";
import { useMisc, useSectionInfos } from "state/definitions";
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
  const handleParamSelection = useCallback(
    (e) => {
      console.log("onMouseDownSelect", sectionId, paramInfoId);
      if (!ancestorIsSelected && useMisc.getState().isSelectingParams) {
        e.stopPropagation();
        toggleParamSelected(sectionId, paramInfoId);
      }
    },
    [ancestorIsSelected, sectionId, paramInfoId],
  );

  // No need for additional useCallback since this is just a simple conditional
  const onMouseDownConditional = hasChildren ? handleParamSelection : undefined;
  const onMouseDownAlways = handleParamSelection;

  return (
    <ParamContainer
      {...props}
      isKwarg={isKwarg}
      paramChildren={paramChildren}
      onMouseDown={onMouseDownAlways}
    >
      {isKwarg ? (
        <ParamNameInput
          sectionId={sectionId}
          paramInfoId={paramInfoId}
          hasChildren={hasChildren}
          onMouseDown={onMouseDownConditional}
        />
      ) : (
        <ParamTextLabel
          paramInfoId={paramInfoId}
          onMouseDown={onMouseDownConditional}
        />
      )}
    </ParamContainer>
  );
}

export const ParamSwitch = React.memo(_ParamSwitch);
