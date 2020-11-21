import React from "react";
import { useStoreActions, useStoreState } from "easy-peasy";
import { MenuItem } from "@chakra-ui/react";

const SingleMenuObj = ({ theSectionName, moduleName, name, currParams }) => {
  const { globalCurrParams } = useStoreState((state) => state.globalCurrParams);
  const { setSelected } = useStoreActions((actions) => actions.master);
  const {
    setCurrObjName,
    setGlobalCurrObj,
    maybeInitGlobalCurrObjsThunk,
  } = useStoreActions((actions) => actions.globalCurrObj);
  const { setCurrModuleName, setGlobalCurrModuleThunk } = useStoreActions(
    (actions) => actions.globalCurrModule
  );

  const setSelectedAndCurrObj = () => {
    setCurrObjName(name);
    setCurrModuleName(moduleName);
    //need to check if value matches def_val first before pushing change
    setGlobalCurrObj(globalCurrParams);
    setGlobalCurrModuleThunk();
    maybeInitGlobalCurrObjsThunk();

    //reset to empty
    setSelected({ theSectionName, name, currParams });
  };

  return <MenuItem onClick={() => setSelectedAndCurrObj()}>{name}</MenuItem>;
};

export default React.memo(SingleMenuObj);
