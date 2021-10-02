import { useStoreActions } from "easy-peasy";
import { useState, useEffect } from "react";

import {
  useParamEnteredValue,
  useParamChildId,
} from "../../../../../../../../../utils/useCreateInfo";
import { nullOrUndefined } from "../../../../../../../../../utils/utils";
import ParamUI from "../ParamUIs/ParamUI";

export default function ParamInput(props) {
  const { paramInfo, uiType } = props;
  const paramInfoId = paramInfo.id;
  const { defaultVal } = paramInfo;

  const [enteredValue, setEnteredValue] = useParamEnteredValue(
    paramInfo.id,
    props.enteredValue,
    props.setEnteredValue
  );
  const childId = useParamChildId(paramInfoId, props.childId, props.setChildId);
  const setIsRendered = useStoreActions((x) => x.sections.setIsRendered);
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
    setIsRendered((x) => {
      return { ...x, [childId]: false };
    });
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
