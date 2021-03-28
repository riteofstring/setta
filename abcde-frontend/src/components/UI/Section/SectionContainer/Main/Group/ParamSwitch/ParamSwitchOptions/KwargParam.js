import ParamContainer from "../ParamContainer/ParamContainer";
import ParamNameInput from "../ParamContainer/ParamItems/ParamNameInput";
import { useState, useEffect } from "react";
import { useStoreActions, useStoreState } from "easy-peasy";

export default function KwargParam(props) {
  const { sectionId, moduleName, objName, inputKwargName } = props;

  const [kwargName, setKwargName] = useState(
    inputKwargName ? inputKwargName : ""
  );

  const savedKwargs = useStoreState(
    (state) =>
      state.savedKwargs.savedKwargs[sectionId]?.[moduleName]?.[objName]?.[
        kwargName
      ]
  );

  const setSavedKwargs = useStoreActions(
    (actions) => actions.savedKwargs.setSavedKwargs
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

  const savedKwargsReplaceParamName = useStoreActions(
    (actions) => actions.savedKwargs.replaceParamName
  );

  useEffect(() => {
    setKwargName(inputKwargName);
  }, [sectionId, moduleName, objName]);

  const onSubmit = (v) => {
    // if old key is in savedKwargs, then replace it with new key
    if (savedKwargs === true) {
      for (let F of [
        globalCurrReplaceParamName,
        uiTypesReplaceParamName,
        nestedSectionIdsReplaceParamName,
        uiTypeConfigsReplaceParamName,
        savedKwargsReplaceParamName,
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
      // old key is not in savedKwargs, so initialize it with "exists: true"
      // so that it is known to exist by the UI Type Modal
      setSavedKwargs({
        sectionId,
        moduleName,
        objName,
        paramName: v,
        exists: true,
      });
    }
    setKwargName(v);
  };

  return (
    <ParamContainer {...props} parameter={{ name: kwargName }}>
      <ParamNameInput value={kwargName} onSubmit={onSubmit} />
    </ParamContainer>
  );
}
