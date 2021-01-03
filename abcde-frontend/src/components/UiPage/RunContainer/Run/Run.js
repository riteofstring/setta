import React from "react";
import { useStoreActions } from "easy-peasy";
import { Button } from "@chakra-ui/react";

const Run = () => {
  const runSelected = useStoreActions(
    (actions) => actions.master.runSelected
  );
  const exportSelected = useStoreActions(
    (actions) => actions.master.exportSelected
  );
  const runExport = () => {
    const {selections} = exportSelected()
    runSelected({selections});
  };

  return <Button onClick={() => runExport()}>Run</Button>;
};

export default React.memo(Run);
