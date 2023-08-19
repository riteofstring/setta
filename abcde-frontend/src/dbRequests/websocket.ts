import { WEBSOCKET } from "abcde-utils/src/addresses";
import { updateOutput } from "thunks/outputs";

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

function processMessage(message) {
  const m = JSON.parse(message);
  if (m.type === "LOG") {
    updateOutput(m.data);
  }
}

export function sendLocation(pathname) {
  if (wss && wss.readyState === 1) {
    wss.send(JSON.stringify({ location: pathname }));
  }
}
