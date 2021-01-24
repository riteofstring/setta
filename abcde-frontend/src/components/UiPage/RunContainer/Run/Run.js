import React from "react";
import { useStoreActions, useStoreState } from "easy-peasy";
import { Button } from "@chakra-ui/react";

const Run = () => {
  const token = useStoreState((state) => state.auth.token);

  const runSelected = useStoreActions(
    (actions) => actions.master.runSelected
  );
  const exportSelected = useStoreActions(
    (actions) => actions.master.exportSelected
  );
  const runExport = () => {
    const {selections} = exportSelected()
    runSelected({token, selections});
  };

  return <Button onClick={() => runExport()}>Run</Button>;
};

export default React.memo(Run);
