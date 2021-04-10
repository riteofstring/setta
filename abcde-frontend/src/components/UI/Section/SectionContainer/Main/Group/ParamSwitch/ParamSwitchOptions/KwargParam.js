import ParamContainer from "../ParamContainer/ParamContainer";
import ParamNameInput from "../ParamContainer/ParamItems/ParamNameInput";
import { useState, useEffect } from "react";
import { useStoreActions, useStoreState } from "easy-peasy";
import { HStack, IconButton } from "@chakra-ui/react";
import { CloseIcon } from "@chakra-ui/icons";
import { parameterStateDetailsGetter } from "../../../../../../../../utils/utils";

export default function KwargParam(props) {
  const {
    sectionId,
    moduleName,
    objName,
    inputKwargName,
    onClickDelete,
  } = props;

  const [kwargName, setKwargName] = useState(
    inputKwargName ? inputKwargName : ""
  );

  const savedKwargs = useStoreState((state) =>
    parameterStateDetailsGetter(
      state.savedKwargs.savedKwargs,
      sectionId,
      moduleName,
      objName,
      kwargName
    )
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

  const globalCurrDelete = useStoreActions(
    (actions) => actions.globalCurr.deleteParamName
  );

  const uiTypesDelete = useStoreActions(
    (actions) => actions.uiTypes.deleteParamName
  );

  const nestedSectionIdsDelete = useStoreActions(
    (actions) => actions.nestedSectionIds.deleteParamName
  );

  const uiTypeConfigsDelete = useStoreActions(
    (actions) => actions.uiTypeConfigs.deleteParamName
  );

  const savedKwargsDelete = useStoreActions(
    (actions) => actions.savedKwargs.deleteParamName
  );

  useEffect(() => {
    setKwargName(inputKwargName);
  }, [sectionId, moduleName, objName, inputKwargName]);

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
    } else if (v) {
      // old key is not in savedKwargs, so initialize it with "exists: true"
      // so that it is known to exist by the UI Type Modal
      // Also, only add string if it is not empty
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

  const deleteFromGlobal = () => {
    for (let F of [
      globalCurrDelete,
      uiTypesDelete,
      nestedSectionIdsDelete,
      uiTypeConfigsDelete,
      savedKwargsDelete,
    ]) {
      F({
        deleteKey: kwargName,
        keysForDescent: {
          sectionId,
          moduleName,
          objName,
        },
      });
    }
  };

  const onClick = () => {
    deleteFromGlobal();
    onClickDelete();
  };

  return (
    <HStack>
      <IconButton
        icon={<CloseIcon w={2} />}
        size="xs"
        variant="outline"
        borderRadius="full"
        onClick={onClick}
      />
      <ParamContainer {...props} parameter={{ name: kwargName }}>
        <ParamNameInput value={kwargName} onSubmit={onSubmit} />
      </ParamContainer>
    </HStack>
  );
}
