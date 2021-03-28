import ParamContainer from "../ParamContainer/ParamContainer";
import ParamNameInput from "../ParamContainer/ParamItems/ParamNameInput";
import { useState } from "react";
import { useStoreActions } from "easy-peasy";

export default function KwargParam(props) {
  const [kwargName, setKwargName] = useState("");

  const replaceParamName = useStoreActions(
    (actions) => actions.globalCurr.replaceParamName
  );

  const onSubmit = (v) => {
    replaceParamName({
      oldKey: kwargName,
      newKey: v,
      keysForDescent: {
        sectionId: props.sectionId,
        moduleName: props.moduleName,
        objName: props.objName,
      },
    });
    setKwargName(v);
  };

  return (
    <ParamContainer {...props} parameter={{ name: kwargName }}>
      <ParamNameInput onSubmit={onSubmit} />
    </ParamContainer>
  );
}
