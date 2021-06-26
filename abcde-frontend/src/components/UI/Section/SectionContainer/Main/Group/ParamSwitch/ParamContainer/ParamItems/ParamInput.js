import { useState, useEffect, useContext } from "react";
import { useStoreActions, useStoreState } from "easy-peasy";
import ParamUI from "../ParamUIs/ParamUI";
import { nullOrUndefined } from "../../../../../../../../../utils/utils";
import { HistoryContext } from "../../../GroupContainer";

export default function ParamInput(props) {
  const { paramInfo } = props;

  const { name: paramName, defaultVal, ancestorNames } = paramInfo;

  const { history, setHistory, getHistory } = useContext(HistoryContext);

  // const setEnteredValue = useStoreActions(
  //   (actions) => actions.master.setEnteredValue
  // );

  // const storedValue = useStoreState((state) =>
  //   state.master.sections.getEnteredValue(sectionId, paramName)
  // );

  const [value, setValue] = useState("");

  useEffect(() => {
    setValue(getHistory(paramName));
  }, [ancestorNames]);

  // console.log("ParamInput", paramName, value, history);

  const onChange = (v) => {
    setValue(v);
    setHistory(paramName, v);
  };

  const onChangeEnd = (v) => {
    onChange(v);
    // setEnteredValue({
    //   sectionId,
    //   paramName,
    //   value: v,
    // });
  };

  // useEffect(() => {
  //   setValue(!nullOrUndefined(storedValue) ? storedValue : "");
  // }, [storedValue]);

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
