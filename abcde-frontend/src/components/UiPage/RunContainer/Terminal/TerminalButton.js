import React from "react";
import { useStoreActions } from "easy-peasy";
import { Button } from "@chakra-ui/react";

const Run = () => {
  const setShowTerminal = useStoreActions(
    (actions) => actions.master.setShowTerminal
  );
  const toggleTerminal = () => {
    setShowTerminal();
  };

  return <Button onClick={() => toggleTerminal()}>Show Terminal</Button>;
};

export default React.memo(Run);
