import { useState, useEffect } from "react";
import { nullOrUndefined } from "utils/utils";

import ParamUI from "../ParamUIs/ParamUI";

export default function ParamInput(props) {
  const { paramInfoId, defaultVal, uiType, enteredValueFn } = props;

  const [enteredValue, setEnteredValue] = enteredValueFn(paramInfoId);
  const [value, setValue] = useState("");

  const onChange = (v) => {
    setValue(v);
  };

  const onChangeEnd = (v) => {
    onChange(v);
    setEnteredValue(v);
  };

  useEffect(() => {
    setValue(!nullOrUndefined(enteredValue) ? enteredValue : "");
  }, [enteredValue]);

  return (
    // <div className="nodrag">
      <ParamUI
        name={uiType.type}
        childProps={{
          value,
          defaultVal,
          onChange,
          onChangeEnd,
          isDisabled: props.isDisabled,
          ...props.uiTypeConfig,
        }}
      />
    // </div>
  );
}
