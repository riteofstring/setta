import _ from "lodash";
import {
  getCurrEffectiveCodeObjImplWithTypeGuard,
  getCurrProjectConfigId,
  setCurrEffectiveCodeObjImplValue,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { useLocalPendingValue } from "state/hooks/utils";
import { route_set_param_entered_value } from "utils/generatedEndpoints";
import { isBaseChildlessCodeObjImpl } from "utils/generatedTypes";
import { ParamUI } from "../ParamUIs/ParamUI";

export function ParamInput({ sectionId, paramInfoId, maybeErrorMessage }) {
  const globalValue = useProjectState((x) => {
    const impl = getCurrEffectiveCodeObjImplWithTypeGuard(
      x,
      sectionId,
      paramInfoId,
      isBaseChildlessCodeObjImpl,
    );
    return impl.value;
  });

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
    debouncedSetParamEnteredValue(sectionId, paramInfoId, vStr);
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
    route_set_param_entered_value({
      projectConfigId: getCurrProjectConfigId(),
      sectionId,
      paramInfoId,
      value,
    });
  },
  50,
);
