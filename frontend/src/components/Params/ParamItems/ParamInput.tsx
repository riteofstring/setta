import _ from "lodash";
import {
  addPendingOp,
  getCurrEffectiveCodeObjImplWithTypeGuard,
  getCurrProjectConfigId,
  setEffectiveCodeObjImplValue,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { route_set_param_entered_value } from "utils/generatedEndpoints";
import { isBaseChildlessCodeObjImpl } from "utils/generatedTypes";
import { ParamUI } from "../ParamUIs/ParamUI";

export function ParamInput({ sectionId, paramInfoId, maybeErrorMessage }) {
  const value = useProjectState((x) => {
    const impl = getCurrEffectiveCodeObjImplWithTypeGuard(
      x,
      sectionId,
      paramInfoId,
      isBaseChildlessCodeObjImpl,
    );
    return impl.value;
  });

  // value and enteredValue should always be string
  function onChange(v) {
    const vStr = _.toString(v);
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
    const frontendOpId = addPendingOp((state) =>
      setEffectiveCodeObjImplValue<"BaseChildlessCodeObj">(
        state,
        sectionId,
        paramInfoId,
        { value: value },
      ),
    );
    route_set_param_entered_value({
      frontendOpId,
      projectConfigId: getCurrProjectConfigId(),
      sectionId,
      paramInfoId,
      value,
    });
  },
  200,
);
