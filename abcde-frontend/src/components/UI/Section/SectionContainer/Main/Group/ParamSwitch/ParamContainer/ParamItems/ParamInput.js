import { useStoreActions } from "easy-peasy";
import { useState, useEffect } from "react";
import { nullOrUndefined } from "utils/utils";

import ParamUI from "../ParamUIs/ParamUI";

export default function ParamInput(props) {
  const { paramInfo, uiType, enteredValueFn, childIdFn } = props;
  const paramInfoId = paramInfo.id;
  const { defaultVal } = paramInfo;

  const [enteredValue, setEnteredValue] = enteredValueFn(paramInfoId);
  const childId = childIdFn(paramInfoId)[0];
  const setIsRendered = useStoreActions((x) => x.sectionInfos.setIsRendered);
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

  useEffect(() => {
    setIsRendered({ sectionId: childId, isRendered: false });
  }, [childId]);

  return (
    <ParamUI
      name={uiType.name}
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
