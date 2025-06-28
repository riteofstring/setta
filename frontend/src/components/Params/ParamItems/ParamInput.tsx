import _ from "lodash";
import { useEffect, useState } from "react";
import {
  getCodeObjImplLayering,
  getEffectiveCodeObjImpl,
} from "state/actions/sectionInfos";
import { maybeIncrementProjectStateVersion } from "state/actions/undo";
import { useProjectState } from "state/definitions";
import {
  isBaseChildlessCodeObjImpl,
  isBaseChildlessCodeObjImplModifier,
} from "utils/generatedTypes";
import { ParamUI } from "../ParamUIs/ParamUI";

export function ParamInput({ sectionId, paramInfoId, maybeErrorMessage }) {
  const enteredValue = useProjectState((x) => {
    const impl = getEffectiveCodeObjImpl(x, paramInfoId, sectionId, null);
    if (!isBaseChildlessCodeObjImpl(impl)) {
      throw new Error();
    }
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
  (sectionId, paramInfoId, vStr) => {
    useProjectState.setState((state) => {
      const implLayering = getCodeObjImplLayering(
        state,
        paramInfoId,
        sectionId,
        null,
      );
      if (!isBaseChildlessCodeObjImplModifier(implLayering.modifier)) {
        throw new Error();
      }
      implLayering.modifier.value = vStr;
    });
    maybeIncrementProjectStateVersion(true);
  },
  50,
);
