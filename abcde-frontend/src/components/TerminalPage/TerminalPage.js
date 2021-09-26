import { Box } from "@chakra-ui/react";
import React, { useState, useEffect } from "react";

import Xterm from "./Terminal";
import "./TerminalPage.module.css";
// import { FitAddon } from "xterm-addon-fit";
import "./xterm.module.css";

// const fitAddon = new FitAddon();

const TerminalPage = () => {
  const [terminalData, setTerminalData] = useState("");
  const xtermRef = React.createRef();

  // ipcRenderer.on("terminal.incomingData", (event, data) => {
  //   setTerminalData(data);
  // });

  useEffect(() => {
    xtermRef.current.terminal.write(terminalData);
  }, [terminalData]);

  return (
    <Box position="absolute" top="200px" width="50vw" height="50vh">
      <div className="TerminalPage" style={{ background: "" }}>
        <h1>Xterm.js</h1>
        <Xterm ref={xtermRef} />
      </div>
    </Box>
  );
};

export default TerminalPage;
