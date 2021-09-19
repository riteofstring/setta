import { useState, useEffect } from "react";
import { useStoreActions, useStoreState } from "easy-peasy";
import ParamUI from "../ParamUIs/ParamUI";
import { nullOrUndefined, createSelectedString } from "../../../../../../../../../utils/utils";
import { HistoryContext } from "../../../GroupContainer";

export default function ParamInput(props) {
  const { sectionId, paramInfo } = props;

  const { name: paramName, defaultVal, ancestorNames } = paramInfo;

  const [selectedString, setSelectedString] = useState(null);

  const setEnteredValue = useStoreActions(
    (actions) => actions.master.setEnteredValue
  );

  const storedValue = useStoreState(
    (state) =>
      state.master.enteredValues.history[sectionId]?.[selectedString]?.[paramName]
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
    setEnteredValue({
      sectionId,
      selected: selectedString,
      paramName,
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
