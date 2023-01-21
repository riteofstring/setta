import { WEBSOCKET } from "abcde-utils/src/addresses";

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
    console.log("Message from server ", event.data);
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
