import { useState, useEffect } from "react";
import { useStoreActions, useStoreState } from "easy-peasy";
import getParamUI from "../ParamUIs/getParamUI";

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

  const currParam = useStoreState(
    (state) =>
      state.globalCurr.globalCurr[sectionId]?.[moduleName]?.[objName]?.[name]
  );

  const [value, setValue] = useState("");

  const onChange = (v) => {
    setValue(v);
  };

  const onChangeEnd = (v) => {
    onChange(v);
    setCurrParam({
      sectionId,
      moduleName,
      objName,
      paramName: name,
      paramValue: v,
    });
  };

  useEffect(() => {
    setValue(currParam !== null && currParam !== undefined ? currParam : "");
  }, [currParam]);

  return getParamUI(props.uiType, { value, defaultVal, onChange, onChangeEnd });
}
