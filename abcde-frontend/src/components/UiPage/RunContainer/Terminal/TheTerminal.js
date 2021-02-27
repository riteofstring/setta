import React, { useState, useEffect } from "react";
import { Box } from "@chakra-ui/react";
import { Terminal } from "xterm";

const TheTerminal = () => {
  const terminal = new Terminal();
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (terminal) {
      setLoaded(true);
    }
  }, [terminal]);

  return (
    <Box w="100vw" bottom="0" position="absolute" h="30vh">
      {loaded && terminal}
    </Box>
  );
};

export default React.memo(TheTerminal);
