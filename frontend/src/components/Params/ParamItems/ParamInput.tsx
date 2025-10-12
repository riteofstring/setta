import _ from "lodash";
import React from "react";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveCodeObjImplWithTypeGuard,
  getCurrProjectConfigId,
  setCurrEffectiveCodeObjImplValue,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { useLocalPendingValue } from "state/hooks/utils";
import { route_set_param_entered_value } from "utils/generatedEndpoints";
import { isBaseChildlessCodeObjImpl } from "utils/generatedTypes";
import { ParamUI } from "../ParamUIs/ParamUI";

function _ParamInput({ sectionId, paramInfoId, maybeErrorMessage }) {
  const { globalValue, name } = useProjectState((x) => {
    const impl = getCurrEffectiveCodeObjImplWithTypeGuard(
      x,
      sectionId,
      paramInfoId,
      isBaseChildlessCodeObjImpl,
      true, // preview
    );
    const name = x.codeObjs[paramInfoId].name;
    return { globalValue: impl.value, name };
  }, _.isEqual);

  const [value, setPendingValue] = useLocalPendingValue(
    globalValue,
    (pendingValue) => {
      useProjectState.setState((state) => {
        setCurrEffectiveCodeObjImplValue<"BaseChildlessCodeObj">(
          state,
          sectionId,
          paramInfoId,
          {
            value: pendingValue,
          },
        );
      });
    },
  );

  // value and enteredValue should always be string
  function onChange(v) {
    const vStr = _.toString(v);
    setPendingValue(vStr);
    if (name === "gridPattern") {
      console.log("[ParamInput:onChange]", {
        sectionId,
        paramInfoId,
        value: vStr,
      });
    }
    debouncedSetParamEnteredValue(sectionId, paramInfoId, vStr);
  }

  if (name === "gridPattern") {
    console.log("gridPattern globalValue:", globalValue);
    console.log("gridPattern value:", value);
  }

  return (
    <ParamUI
      sectionId={sectionId}
      paramInfoId={paramInfoId}
      value={value}
      onChange={onChange}
      maybeErrorMessage={maybeErrorMessage}
    />
  );
}

const debouncedSetParamEnteredValue = _.debounce(
  (sectionId, paramInfoId, value) => {
    dispatchOptimisticProjectStateUpdate({
      apply: (state) => {
        setCurrEffectiveCodeObjImplValue<"BaseChildlessCodeObj">(
          state,
          sectionId,
          paramInfoId,
          {
            value,
          },
        );
      },
      send: (frontendOpId) =>
        route_set_param_entered_value({
          projectConfigId: getCurrProjectConfigId(),
          sectionId,
          paramInfoId,
          value,
          frontendOpId,
        }),
      metadata: {
        action: "set_param_entered_value",
        sectionId,
        paramInfoId,
        value,
      },
    });
  },
  50,
);

export const ParamInput = React.memo(_ParamInput);
