import { useStoreActions, useStoreState } from "easy-peasy";
import { useState, useEffect } from "react";

import { nullOrUndefined } from "../../../../../../../../../utils/utils";
import ParamUI from "../ParamUIs/ParamUI";

export default function ParamInput(props) {
  const { paramInfo } = props;
  const paramInfoId = paramInfo.id;
  const { defaultVal } = paramInfo;
  const setEnteredValue = useStoreActions((x) => x.paramInfos.setEnteredValue);
  const storedValue = useStoreState(
    (x) => x.paramInfos.enteredValue[paramInfoId]
  );
  const [value, setValue] = useState("");

  const onChange = (v) => {
    setValue(v);
  };

  const onChangeEnd = (v) => {
    onChange(v);
    setEnteredValue({
      paramInfoId,
      value: v,
    });
  };

  useEffect(() => {
    setValue(!nullOrUndefined(storedValue) ? storedValue : "");
  }, [storedValue]);

  return (
    <ParamUI
      name={paramInfo.uiType}
      childProps={{
        value,
        defaultVal,
        onChange,
        onChangeEnd,
        isDisabled: props.isDisabled,
        // ...props.paramUITypeConfig,
      }}
    />
  );
}
