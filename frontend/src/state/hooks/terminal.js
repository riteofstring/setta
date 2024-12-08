import C from "constants/constants.json";
import _ from "lodash";
import { useEffect, useRef } from "react";
import { dbGetExistingTerminals } from "requests/terminals";
import { pseudoTemplatedStr } from "requests/utils";
import {
  addChild,
  addSectionInEmptySpace,
} from "state/actions/sections/createSections";
import { useMisc, useProjectConfig, useSectionInfos } from "state/definitions";
import { URLS } from "utils/constants";
import { createNewId } from "utils/idNameCreation";
import { Terminal } from "xterm";
import { AttachAddon } from "xterm-addon-attach";
import { FitAddon } from "xterm-addon-fit";
import "xterm/css/xterm.css";

// Maps from sectionId to a list of websocket connections.
// There should only be 1 websocket for a given section.
// But in case of double renders (basically just StrictMode),
// this keeps a list of websockets, so we can add the new websocket
// while the old one gets deleted.
export const TERMINAL_WEBSOCKETS = {};
export const INITIAL_MESSAGES = {}; // maps from sectionId to a list of messages

export function useTerminal({ sectionId, width, height, setHasScrollbar }) {
  const terminalRef = useRef(null); // Ref for the terminal container
  const fitAddon = useFitAddon();

  useEffect(() => {
    const terminal = new Terminal({
      cursorBlink: true,
      theme: theme,
      // fontFamily: fontFamily,
      // letterSpacing: "0",
      // fontSize: "14",
    }); // Instantiate the terminal
    terminal.loadAddon(fitAddon);
    terminal.open(terminalRef.current); // Attach the terminal to the div

    const { ws, wsId } = newTerminalWebsocket(sectionId);

    terminal.onResize((size) => {
      // Send the new size to the backend
      const message = JSON.stringify({
        messageType: C.WS_TERMINAL_RESIZE,
        cols: size.cols,
        rows: size.rows,
      });
      if (ws.readyState === 1) {
        ws.send(message);
      } else {
        addTerminalInitialMessage(sectionId, message);
      }
    });

    terminal.onRender(() => {
      setHasScrollbar(terminal.buffer.active.baseY > 0);
    });

    function onInitialMessage(message) {
      if (message.data === C.SETTA_TERMINAL_READY) {
        const attachAddon = new AttachAddon(ws);
        terminal.loadAddon(attachAddon);
        ws.removeEventListener("message", onInitialMessage);
      }
    }

    ws.addEventListener("message", onInitialMessage);

    // Even though react flow calls preventDefault and stopPropagation when in pan scrolling mode,
    // xterm still picks up the scrolling. So this sets scrollSensitivity to a small number to disable scrolling when already moving via trackpad.
    const unsub = useMisc.subscribe(
      (x) => x.isPanScrolling,
      (isPanScrolling) => {
        if (isPanScrolling) {
          // can't make it 0
          terminal.options.scrollSensitivity = Number.MIN_VALUE;
        } else {
          terminal.options.scrollSensitivity = 1;
        }
      },
    );

    return () => {
      if (ws.readyState === 1) {
        ws.close();
        terminal.dispose();
      } else {
        ws.addEventListener("open", () => {
          ws.close();
          // Causes Uncaught TypeError: Cannot read properties of undefined (reading 'dimensions')
          // https://github.com/xtermjs/xterm.js/issues/4775
          terminal.dispose();
        });
      }

      unsub();
    };
  }, []);

  useEffect(() => {
    fitAddon.fit();
  }, [width, height]);

  return terminalRef;
}

function useFitAddon() {
  const fitAddon = useRef(null);

  if (!fitAddon.current) {
    fitAddon.current = new FitAddon();
  }

  return fitAddon.current;
}

function newTerminalWebsocket(sectionId) {
  const projectConfigId = useProjectConfig.getState().id;
  const id = createNewId();
  const isTemporary = !!useSectionInfos.getState().x[sectionId].isTemporary;
  const wsTerminalAddress = `${URLS.WEBSOCKET}${pseudoTemplatedStr(C.ROUTE_TERMINAL, { projectConfigId, sectionId, id, isTemporary })}`;
  const ws = new WebSocket(wsTerminalAddress);
  ws.addEventListener("open", async () => {
    if (INITIAL_MESSAGES[sectionId]?.length > 0) {
      const sentMessageIdx = [];
      for (const [idx, initialMessage] of INITIAL_MESSAGES[
        sectionId
      ].entries()) {
        // hack to get backend to receive distinct messages rather than 1 grouped message
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (ws.readyState === 1) {
          ws.send(initialMessage);
          sentMessageIdx.push(idx);
        }
      }
      INITIAL_MESSAGES[sectionId] = INITIAL_MESSAGES[sectionId].filter(
        (x, idx) => !sentMessageIdx.includes(idx),
      );
    }
  });

  function cleanupTerminalWebsockets() {
    if (sectionId in TERMINAL_WEBSOCKETS) {
      TERMINAL_WEBSOCKETS[sectionId] = removeWsFromArray(
        TERMINAL_WEBSOCKETS[sectionId],
        ws,
      );
    }
  }

  ws.addEventListener("close", cleanupTerminalWebsockets);
  ws.addEventListener("error", cleanupTerminalWebsockets);

  if (!(sectionId in TERMINAL_WEBSOCKETS)) {
    TERMINAL_WEBSOCKETS[sectionId] = [];
  }
  TERMINAL_WEBSOCKETS[sectionId].push(ws);

  return { ws, wsId: id };
}

const theme = {
  foreground: "#B8C2D5",
  // background: "#0D1016",
  background: "#06070A",
  cursor: "#B8C2D5",
  selection: "#49483e",
  black: "#272822",
  red: "#f92672",
  green: "#a6e22e",
  yellow: "#f4bf75",
  blue: "#66d9ef",
  magenta: "#ae81ff",
  cyan: "#a1efe4",
  white: "#f8f8f2",
  brightBlack: "#75715e",
  brightRed: "#f92672",
  brightGreen: "#a6e22e",
  brightYellow: "#f4bf75",
  brightBlue: "#66d9ef",
  brightMagenta: "#ae81ff",
  brightCyan: "#a1efe4",
  brightWhite: "#f9f8f5",
};

// const fontFamily = {
//   fontFamily:
//     'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;',
// };

export function addTerminalInitialMessage(sectionId, msg) {
  if (!(sectionId in INITIAL_MESSAGES)) {
    INITIAL_MESSAGES[sectionId] = [];
  }
  if (!INITIAL_MESSAGES[sectionId].includes(msg)) {
    INITIAL_MESSAGES[sectionId].push(msg);
  }
}

export function sendTerminalMessage(sectionId, msg) {
  for (const ws of TERMINAL_WEBSOCKETS[sectionId]) {
    if (ws.readyState === 1) {
      ws.send(msg);
      break;
    }
  }
}

function removeWsFromArray(x, ws) {
  return x.filter((w) => w !== ws);
}

export async function restoreTerminals() {
  const res = await dbGetExistingTerminals(useProjectConfig.getState().id);
  if (res.status === 200) {
    const existingTerminalInfo = res.data;
    const terminalsWithoutSections = existingTerminalInfo.filter(
      (x) => !(x.id in useSectionInfos.getState().x),
    );
    if (terminalsWithoutSections.length === 0) {
      return;
    }
    const groupId = addSectionInEmptySpace({
      type: C.DECK,
      sectionProps: {
        name: getRestoredTerminalsGroupName(),
        isTemporary: terminalsWithoutSections.every((x) => x.isTemporary),
      },
    });
    for (const terminalInfo of terminalsWithoutSections) {
      addChild({
        id: terminalInfo.id,
        parentId: groupId,
        type: C.TERMINAL,
        sectionProps: {
          isTemporary: terminalInfo.isTemporary,
        },
      });
    }
  }
}

function getRestoredTerminalsGroupName() {
  const baseName = "Restored Terminals";
  const numExisting = _.size(
    _.pickBy(useSectionInfos.getState().x, (s) => s.name.startsWith(baseName)),
  );
  if (numExisting === 0) {
    return baseName;
  }
  return `${baseName} ${numExisting + 1}`;
}
