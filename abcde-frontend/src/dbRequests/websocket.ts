import { WEBSOCKET } from "abcde-utils/src/addresses";
import { updateOutput } from "thunks/outputs";
import { setWebsocketRoomMessage } from "thunks/websocket";

let wss;

export function openWebSocket(pathname) {
  if (!wss) {
    wss = new WebSocket(WEBSOCKET);
  }

  wss.addEventListener("open", () => {
    sendLocation(pathname);
  });

  wss.addEventListener("message", (event) => {
    processMessage(event.data);
  });

  wss.addEventListener("error", () => {
    wss.close();
    wss = null;
  });
}

export function closeWebSocket() {
  if (wss) {
    wss.close();
    wss = null;
  }
}

function wssReady() {
  return wss && wss.readyState === 1;
}

function processMessage(message) {
  const m = JSON.parse(message);
  if (m.type === "LOG") {
    updateOutput(m.data);
  } else {
    setWebsocketRoomMessage(m);
  }
}

export function sendLocation(pathname) {
  if (wssReady()) {
    wss.send(JSON.stringify({ location: pathname }));
  }
}

export function sendMessage(message, id) {
  if (wssReady()) {
    wss.send(
      JSON.stringify({
        id,
        message,
        toLocation: "computer:Kevin",
        messageType: "codeCompletionRequest",
      })
    );
  }
}
