import React from "react";
import { useStoreActions } from "easy-peasy";
import { Button } from "@chakra-ui/react";

const Run = () => {
  const { exportSelected, setActiveObj } = useStoreActions(
    (actions) => actions.master
  );
  const {
    setGlobalCurrThunk: setGlobalCurrObjThunk,
    setCurrName: setCurrObjName,
  } = useStoreActions((actions) => actions.globalCurrObj);
  const {
    setGlobalCurrThunk: setGlobalCurrModuleThunk,
    setCurrName: setCurrModuleName,
  } = useStoreActions((actions) => actions.globalCurrModule);
  const {
    setCurrName: setCurrSectionName,
    setGlobalCurrThunk: setGlobalCurrSectionThunk,
  } = useStoreActions((actions) => actions.globalCurrSection);

  const runExport = () => {
    setActiveObj("");
    setCurrSectionName(null);
    setCurrModuleName(null);
    setCurrObjName(null);
    setGlobalCurrObjThunk();
    setGlobalCurrModuleThunk();
    setGlobalCurrSectionThunk();
    exportSelected();
  };

  return <Button onClick={() => runExport()}>Run</Button>;
};

export default React.memo(Run);
