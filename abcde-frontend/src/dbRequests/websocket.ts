import { WEBSOCKET } from "abcde-utils/src/addresses";
import { useOutputs } from "models/info/outputs";

let wss;

export function openWebSocket() {
  if (!wss) {
    console.log("connecting to websocket");
    wss = new WebSocket(WEBSOCKET);
  }

  wss.addEventListener("open", (event) => {
    console.log("connection opened", wss.readyState);
  });

  wss.addEventListener("message", (event) => {
    processMessage(event.data);
  });

  wss.addEventListener("close", (event) => {
    console.log("The connection has been closed successfully.");
  });

  wss.addEventListener("error", (event) => {
    wss.close();
    wss = null;
  });
}

export function closeWebSocket() {
  console.log("wss.readyState", wss?.readyState);
  if (wss) {
    wss.close();
    wss = null;
  }
}

function processMessage(message) {
  const m = JSON.parse(message);
  if (m.type === "LOG") {
    useOutputs.getState().appendValue(m.data);
  }
}
