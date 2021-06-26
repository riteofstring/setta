import { useState, useEffect } from "react";
import { useStoreActions, useStoreState } from "easy-peasy";
import ParamUI from "../ParamUIs/ParamUI";
import { nullOrUndefined } from "../../../../../../../../../utils/utils";

export default function ParamInput(props) {
  const { sectionId, paramInfo } = props;

  const defaultVal = paramInfo.defaultVal;

  // const setEnteredValue = useStoreActions(
  //   (actions) => actions.master.setEnteredValue
  // );

  // const storedValue = useStoreState((state) =>
  //   state.master.sections.getEnteredValue(sectionId, paramName)
  // );

  const [value, setValue] = useState("");

  const onChange = (v) => {
    setValue(v);
  };

  const onChangeEnd = (v) => {
    // onChange(v);
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
