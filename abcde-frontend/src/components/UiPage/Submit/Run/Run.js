import React from "react";
import { useStoreActions } from "easy-peasy";
import { Button } from "@chakra-ui/react";

const Run = () => {
  const { exportSelected } = useStoreActions((actions) => actions.master);
  const runExport = () => {
    exportSelected();
  };

  return <Button onClick={() => runExport()}>Run</Button>;
};

export default React.memo(Run);
