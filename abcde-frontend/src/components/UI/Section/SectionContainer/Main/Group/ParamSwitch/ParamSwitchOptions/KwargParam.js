import ParamContainer from "../ParamContainer/ParamContainer";
import ParamNameInput from "../ParamContainer/ParamItems/ParamNameInput";
import { useState } from "react";
import { useStoreActions, useStoreState } from "easy-peasy";

export default function KwargParam(props) {
  const [kwargName, setKwargName] = useState("");

  const { sectionId, moduleName, objName } = props;

  const globalCurr = useStoreState(
    (state) =>
      state.globalCurr.globalCurr[sectionId]?.[moduleName]?.[objName]?.[
        kwargName
      ]
  );

  const setGlobalCurr = useStoreActions(
    (actions) => actions.globalCurr.setGlobalCurr
  );

  const globalCurrReplaceParamName = useStoreActions(
    (actions) => actions.globalCurr.replaceParamName
  );

  const uiTypesReplaceParamName = useStoreActions(
    (actions) => actions.uiTypes.replaceParamName
  );

  const nestedSectionIdsReplaceParamName = useStoreActions(
    (actions) => actions.nestedSectionIds.replaceParamName
  );

  const uiTypeConfigsReplaceParamName = useStoreActions(
    (actions) => actions.uiTypeConfigs.replaceParamName
  );

  const onSubmit = (v) => {
    // if old key is in globalCurr, then replace it with new key
    if (globalCurr !== undefined && globalCurr !== null) {
      for (let F of [
        globalCurrReplaceParamName,
        uiTypesReplaceParamName,
        nestedSectionIdsReplaceParamName,
        uiTypeConfigsReplaceParamName,
      ]) {
        F({
          oldKey: kwargName,
          newKey: v,
          keysForDescent: {
            sectionId,
            moduleName,
            objName,
          },
        });
      }
    } else {
      // old key is not in globalCurr, so initialize it with empty string
      // so that it is known to exist by the UI Type Modal
      setGlobalCurr({
        sectionId,
        moduleName,
        objName,
        paramName: v,
        paramValue: "",
      });
    }
    setKwargName(v);
  };

  return (
    <ParamContainer {...props} parameter={{ name: kwargName }}>
      <ParamNameInput onSubmit={onSubmit} />
    </ParamContainer>
  );
}
