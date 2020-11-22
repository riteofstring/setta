import React from "react";
import { useStoreActions, useStoreState } from "easy-peasy";
import { MenuItem } from "@chakra-ui/react";

const TheMenuObj = ({ sectionId, moduleName, name, currParams }) => {

  const { globalCurr: globalCurrParams } = useStoreState(
    (state) => state.globalCurrParams
  );
  const { setSelected } = useStoreActions((actions) => actions.master);
  const {
    maybeInitGlobalCurrThunk: maybeInitGlobalCurrParamsThunk,
  } = useStoreActions((actions) => actions.globalCurrParams);
  const {
    setCurrName: setCurrObjName,
    setGlobalCurr: setGlobalCurrObj,
    maybeInitGlobalCurrThunk: maybeInitGlobalCurrObjsThunk,
  } = useStoreActions((actions) => actions.globalCurrObj);
  const {
    setCurrName: setCurrModuleName,
    setGlobalCurrThunk: setGlobalCurrModuleThunk,
    maybeInitGlobalCurrThunk: maybeInitGlobalCurrModuleThunk,
  } = useStoreActions((actions) => actions.globalCurrModule);
  const {
    setCurrName: setCurrSectionName,
    setGlobalCurrThunk: setGlobalCurrSectionThunk,
  } = useStoreActions((actions) => actions.globalCurrSection);

  const setSelectedAndCurrObj = () => {
    setCurrObjName(name);
    setCurrModuleName(moduleName);
    setCurrSectionName(sectionId);
    setGlobalCurrObj(globalCurrParams);
    setGlobalCurrModuleThunk();
    setGlobalCurrSectionThunk();
    maybeInitGlobalCurrModuleThunk();
    maybeInitGlobalCurrObjsThunk();
    maybeInitGlobalCurrParamsThunk();
    setSelected({ sectionId, moduleName, name, currParams });
  };

  return <MenuItem onClick={() => setSelectedAndCurrObj()}>{name}</MenuItem>;
};

export default React.memo(TheMenuObj);
