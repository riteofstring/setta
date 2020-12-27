import React, { useState, useEffect } from "react";
import { Box } from "@chakra-ui/react";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import "./xterm.module.css";
import "./TerminalPage.module.css";
import { Resizable } from "re-resizable";
import ResizeObserver from "react-resize-observer";
import c from "ansi-colors";

let term;
const fitAddon = new FitAddon();

const TerminalPage = () => {
  const [logs, setLogs] = useState("");
  const dispatchLogs = () => {
    setLogs();
  };

  const prompt = () => {
    var shellprompt = "$ ";
    term.write("\r\n" + shellprompt);
  };

  useEffect(() => {
    term = new Terminal({
      convertEol: true,
      fontFamily: `'Fira Mono', monospace`,
      fontSize: 15,
      fontWeight: 900,
      // rendererType: "dom" // default is canvas
    });

    //Styling
    term.setOption("theme", {
      background: "black",
      foreground: "white",
    });

    // Load Fit Addon
    term.loadAddon(fitAddon);

    // Open the terminal in #terminal-container
    term.open(document.getElementById("xterm"));

    //Write text inside the terminal
    term.write(c.magenta("I am ") + c.blue("Blue") + c.red(" and i like it"));

    // Make the terminal's size and geometry fit the size of #terminal-container
    fitAddon.fit();

    term.onKey((key) => {
      const char = key.domEvent.key;
      if (char === "Enter") {
        this.prompt();
      } else if (char === "Backspace") {
        term.write("\b \b");
      } else {
        term.write(char);
      }
    });

    prompt();
  });
  return (
    <Box position="absolute" top="200px" width="50vw" height="50vh">
      <div className="TerminalPage" style={{ background: "" }}>
        <h1>Xterm.js</h1>
        <Resizable
          width={500}
          height={350}
          style={{
            background: "firebrick",
            padding: "0.4em",
            margin: "1em",
          }}
        >
          <div id="xterm" style={{ height: "100%", width: "100%" }} />
          <ResizeObserver
            onResize={(rect) => {
              fitAddon.fit();
              console.log("Resized. New bounds:", rect.width, "x", rect.height);
            }}
            onPosition={(rect) => {
              console.log("Moved. New position:", rect.left, "x", rect.top);
            }}
          />
        </Resizable>
      </div>
    </Box>
  );
};

export default TerminalPage;
