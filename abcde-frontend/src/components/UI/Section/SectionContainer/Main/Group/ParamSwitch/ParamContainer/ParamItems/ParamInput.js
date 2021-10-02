import { useStoreActions } from "easy-peasy";
import { useState, useEffect } from "react";

import {
  useChildId,
  useEnteredValue,
} from "../../../../../../../../../utils/useCreateInfo";
import { nullOrUndefined } from "../../../../../../../../../utils/utils";
import ParamUI from "../ParamUIs/ParamUI";

export default function ParamInput(props) {
  const { sectionId, paramInfo, uiType } = props;
  const paramInfoId = paramInfo.id;
  const { defaultVal } = paramInfo;
  const setEnteredValue = useStoreActions((x) => x.paramInfos.setEnteredValue);
  const setIsRendered = useStoreActions((x) => x.sections.setIsRendered);
  const existingChildId = useChildId(sectionId, paramInfoId);
  const storedValue = useEnteredValue(sectionId, paramInfoId);
  const [value, setValue] = useState("");

  const onChange = (v) => {
    setValue(v);
  };

  const onChangeEnd = (v) => {
    onChange(v);
    setEnteredValue({
      sectionId,
      paramInfoId,
      value: v,
    });
  };

  useEffect(() => {
    setValue(!nullOrUndefined(storedValue) ? storedValue : "");
  }, [storedValue]);

  useEffect(() => {
    setIsRendered((x) => {
      return { ...x, [existingChildId]: false };
    });
  }, [existingChildId]);

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
