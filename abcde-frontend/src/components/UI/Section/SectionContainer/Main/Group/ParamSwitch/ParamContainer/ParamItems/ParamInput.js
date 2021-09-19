import { useState, useEffect } from "react";
import ParamUI from "../ParamUIs/ParamUI";
import {
  nullOrUndefined,
  createSelectedString,
} from "../../../../../../../../../utils/utils";
import { enteredValues } from "../../../../../../state";
import { useAtom } from "jotai";

export default function ParamInput(props) {
  const { sectionId, paramInfo } = props;

  const { name: paramName, defaultVal, ancestorNames } = paramInfo;

  const [selectedString, setSelectedString] = useState(null);

  const [storedValue, setEnteredValue] = useAtom(
    enteredValues({ sectionId, selected: selectedString, paramName })
  );

  const [value, setValue] = useState("");

  useEffect(() => {
    setSelectedString(createSelectedString(ancestorNames[1], ancestorNames[2]));
  }, [ancestorNames]);

  // console.log("ParamInput", paramName, value, history);

  const onChange = (v) => {
    setValue(v);
  };

  const onChangeEnd = (v) => {
    onChange(v);
    setEnteredValue(v);
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
