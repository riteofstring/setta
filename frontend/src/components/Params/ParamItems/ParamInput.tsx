import _ from "lodash";
import { useEffect, useState } from "react";
import {
  getCurrEffectiveCodeObjImplWithTypeGuard,
  getCurrProjectConfigId,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { route_set_param_entered_value } from "utils/generatedEndpoints";
import { isBaseChildlessCodeObjImpl } from "utils/generatedTypes";
import { ParamUI } from "../ParamUIs/ParamUI";

export function ParamInput({ sectionId, paramInfoId, maybeErrorMessage }) {
  const enteredValue = useProjectState((x) => {
    const impl = getCurrEffectiveCodeObjImplWithTypeGuard(
      x,
      sectionId,
      paramInfoId,
      isBaseChildlessCodeObjImpl,
    );
    return impl.value;
  });
  const [value, setValue] = useState(enteredValue);

  // value and enteredValue should always be string
  function onChange(v) {
    const vStr = _.toString(v);
    setValue(vStr);
    debouncedSetParamEnteredValue(sectionId, paramInfoId, vStr);
  }

  useEffect(() => {
    if (value !== enteredValue) {
      setValue(enteredValue);
    }
  }, [enteredValue]);

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
  200,
);
