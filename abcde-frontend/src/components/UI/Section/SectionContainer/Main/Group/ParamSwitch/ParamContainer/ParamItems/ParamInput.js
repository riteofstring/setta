import { useState, useEffect } from "react";
import { useStoreActions, useStoreState } from "easy-peasy";
import getParamUI from "../ParamUIs/getParamUI";
import { checkGlobalCurrEquality } from "../../../../../../../../../utils/utils";

export default function ParamInput(props) {
  const {
    sectionId,
    moduleName,
    objName,
    parameter: { name, defaultVal },
  } = props;

  const setCurrParam = useStoreActions(
    (actions) => actions.globalCurr.setCurrParam
  );

  const equalityFn = checkGlobalCurrEquality(
    sectionId,
    moduleName,
    objName,
    name
  );

  const globalCurr = useStoreState(
    (state) => state.globalCurr.globalCurr,
    (prev, next) => equalityFn(prev, next)
  );

  const [value, setValue] = useState("");

  const onChange = (value) => {
    setValue(value);
  };

  const onChangeEnd = (value) => {
    onChange(value)
    setCurrParam({
      sectionId,
      moduleName,
      objName,
      paramName: name,
      paramValue: value,
    });
  };

  useEffect(() => {
    let savedParam = null;

    try {
      savedParam = globalCurr[sectionId][moduleName][objName][name];
    } catch (err) {}

    const toBeSet =
      savedParam !== null && savedParam !== undefined ? savedParam : "";
    setValue(toBeSet);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionId, moduleName, objName]);

  return getParamUI(props.uiType, { value, defaultVal, onChange, onChangeEnd });
}
