import { useParamEnteredValue } from "hooks/useEnteredValue";
import _ from "lodash";
import { useEffect, useState } from "react";
import ParamUI from "../ParamUIs/ParamUI";

export default function ParamInput({
  sectionId,
  paramInfoId,
  defaultVal,
  uiType,
  isDisabled,
}) {
  const { enteredValue, setEnteredValue } = useParamEnteredValue(
    sectionId,
    paramInfoId
  );
  const [value, setValue] = useState("");

  const onChange = (v) => {
    setValue(v);
  };

  const onBlur = (v) => {
    onChange(v);
    setEnteredValue(v);
  };

  useEffect(() => {
    setValue(!_.isNil(enteredValue) ? enteredValue : "");
  }, [enteredValue]);

  return (
    <ParamUI
      name={uiType.type}
      childProps={{
        value,
        defaultVal,
        onChange,
        onBlur,
        isDisabled,
        className: "nodrag",
        ...uiType.config,
      }}
    />
  );
}
