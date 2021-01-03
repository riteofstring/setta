import React from "react";
import { useStoreActions, useStoreState } from "easy-peasy";
import { Button } from "@chakra-ui/react";

const Save = () => {
  const saveUI = useStoreActions(
    (actions) => actions.master.saveUI
  );
  const exportSelected = useStoreActions(
    (actions) => actions.master.exportSelected
  );
  const token = useStoreState((state) => state.auth.token);
  const runSaveUI = () => {
    const {selections, globalCurr} = exportSelected()
    saveUI({token, selections, globalCurr});
  };

  return <Button onClick={() => runSaveUI()}>Save</Button>;
};

export default React.memo(Save);
