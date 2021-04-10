import { useState, useEffect } from "react";
import { useStoreActions, useStoreState } from "easy-peasy";
import ParamUI from "../ParamUIs/ParamUI";
import { nullOrUndefined } from "../../../../../../../../../utils/utils";

export default function ParamInput(props) {
  const {
    sectionId,
    parameter: { name, defaultVal },
  } = props;

  const setEnteredValue = useStoreActions(
    (actions) => actions.master.setEnteredValue
  );

  const currParam = useStoreState((state) =>
    state.master.sections.getEnteredValue(sectionId, name)
  );

  const [value, setValue] = useState("");

  const onChange = (v) => {
    setValue(v);
  };

  const onChangeEnd = (v) => {
    onChange(v);
    setEnteredValue({
      sectionId,
      paramName: name,
      value: v,
    });
  };

  useEffect(() => {
    setValue(!nullOrUndefined(currParam) ? currParam : "");
  }, [currParam]);

  return (
    <ParamUI
      uiType={props.uiType}
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
