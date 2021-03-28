import React, { useState, useLayoutEffect } from "react";
import { useStoreActions, useStoreState } from "easy-peasy";
import TextInput from "../ParamUIs/TextInput";
import SliderInput from "../ParamUIs/SliderInput";

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

  const globalCurr = useStoreState(
    (state) => state.globalCurr.globalCurr,
    (prev, next) => checkGlobalCurrEquality(prev, next)
  );

  const [value, setValue] = useState(defaultVal);

  const checkGlobalCurrEquality = (prev, next) => {
    let prevParam = null;
    let nextParam = null;
    try {
      prevParam = prev[sectionId][moduleName][objName][name];
    } catch (err) {}
    try {
      nextParam = next[sectionId][moduleName][objName][name];
    } catch (err) {}
    return prevParam === nextParam;
  };

  const sendState = (value) => {
    setValue(value);
    setCurrParam({
      sectionId,
      moduleName,
      objName,
      paramName: name,
      paramValue: value,
    });
  };

  useLayoutEffect(() => {
    let savedParam = null;

    try {
      savedParam = globalCurr[sectionId][moduleName][objName][name];
    } catch (err) {}

    setValue(
      savedParam !== null && savedParam !== undefined ? savedParam : defaultVal
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionId, moduleName, objName]);

  
  const getParamUI = (childProps) => {
    switch (props.uiType) {
      default:
        return <TextInput {...childProps}/>;
      case "SLIDER":
        return <SliderInput {...childProps}/>;
    }
  };

  return getParamUI({ value, defaultVal, sendState });
}
