import _ from "lodash";
import React, { useCallback } from "react";
import { toggleParamSelected } from "state/actions/kwargs";
import { getDisplayedCodeInfoCol } from "state/actions/sectionInfos";
import { useMisc, useSectionInfos } from "state/definitions";
import { ParamContainer } from "./ParamContainer";
import { ParamNameInput } from "./ParamItems/ParamNameInput";
import { ParamTextLabel } from "./ParamItems/ParamTextLabel";

function _ParamSwitch(props) {
  const { sectionId, paramInfoId } = props;

  const { paramIsSelected, isKwarg, paramChildren } = useSectionInfos((x) => {
    const codeInfoChildren = getDisplayedCodeInfoCol(sectionId, x).children;
    return {
      paramIsSelected: x.codeInfo[paramInfoId].isSelected,
      isKwarg: x.codeInfo[paramInfoId].editable,
      paramChildren: codeInfoChildren[paramInfoId] ?? [],
    };
  }, _.isEqual);

  const hasChildren = paramChildren.length > 0;
  const handleParamSelection = useCallback(
    (e) => {
      if (useMisc.getState().isSelectingParams) {
        e.stopPropagation();
        toggleParamSelected(sectionId, paramInfoId);
      }
    },
    [sectionId, paramInfoId],
  );

  // No need for additional useCallback since this is just a simple conditional
  const onMouseDownConditional = hasChildren ? handleParamSelection : undefined;
  const onMouseDownAlways = handleParamSelection;

  const bg = paramIsSelected
    ? "transition-colors active:!bg-cyan-300 !bg-blue-700 [&_*]:!text-white"
    : "transition-colors";

  return (
    <ParamContainer
      {...props}
      isKwarg={isKwarg}
      paramChildren={paramChildren}
      onMouseDown={onMouseDownAlways}
      bg={bg}
    >
      {isKwarg ? (
        <ParamNameInput
          sectionId={sectionId}
          paramInfoId={paramInfoId}
          hasChildren={hasChildren}
          onMouseDown={onMouseDownConditional}
          bg={bg}
        />
      ) : (
        <ParamTextLabel
          sectionId={sectionId}
          paramInfoId={paramInfoId}
          onMouseDown={onMouseDownConditional}
          bg={bg}
        />
      )}
    </ParamContainer>
  );
}

export const ParamSwitch = React.memo(_ParamSwitch);
