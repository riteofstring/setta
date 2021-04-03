import { useState, useEffect } from "react";
import { useStoreActions, useStoreState } from "easy-peasy";
import ParamUI from "../ParamUIs/ParamUI";
import { parameterStateDetailsGetter } from "../../../../../../../../../utils/utils";

export default function ParamInput(props) {
  const {
    sectionId,
    moduleName,
    objName,
    parameter: { name, defaultVal },
  } = props;

  const setGlobalCurr = useStoreActions(
    (actions) => actions.globalCurr.setGlobalCurr
  );

  const currParam = useStoreState((state) =>
    parameterStateDetailsGetter(
      state.globalCurr.globalCurr,
      sectionId,
      moduleName,
      objName,
      name
    )
  );

  const [value, setValue] = useState("");

  const onChange = (v) => {
    setValue(v);
  };

  const onChangeEnd = (v) => {
    onChange(v);
    setGlobalCurr({
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

  return (
    <ParamUI
      uiType={props.uiType}
      childProps={{
        value,
        defaultVal,
        onChange,
        onChangeEnd,
        isDisabled: props.isDisabled,
        ...props.uiTypeConfig,
      }}
    />
  );
}
