import React from "react";
import { useStoreActions, useStoreState } from "easy-peasy";
import { MenuItem } from "@chakra-ui/react";

const TheMenuObj = ({ sectionName, moduleName, name, currParams }) => {
  const { globalCurrParams } = useStoreState((state) => state.globalCurrParams);
  const { setSelected } = useStoreActions((actions) => actions.master);
  const { maybeInitGlobalCurrParamsThunk } = useStoreActions(
    (actions) => actions.globalCurrParams
  );
  const {
    setCurrObjName,
    setGlobalCurrObj,
    maybeInitGlobalCurrObjsThunk,
  } = useStoreActions((actions) => actions.globalCurrObj);
  const {
    setCurrModuleName,
    setGlobalCurrModuleThunk,
    maybeInitGlobalCurrModuleThunk,
  } = useStoreActions((actions) => actions.globalCurrModule);
  const { setCurrSectionName, setGlobalCurrSectionThunk } = useStoreActions(
    (actions) => actions.globalCurrSection
  );

  const setSelectedAndCurrObj = () => {
    setCurrObjName(name);
    setCurrModuleName(moduleName);
    setCurrSectionName(sectionName);
    setGlobalCurrObj(globalCurrParams);
    setGlobalCurrModuleThunk();
    setGlobalCurrSectionThunk();
    maybeInitGlobalCurrModuleThunk();
    maybeInitGlobalCurrObjsThunk();
    maybeInitGlobalCurrParamsThunk();

    //reset to empty
    setSelected({ sectionName, name, currParams });
  };

  return <MenuItem onClick={() => setSelectedAndCurrObj()}>{name}</MenuItem>;
};

export default React.memo(TheMenuObj);
