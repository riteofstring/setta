import { WEBSOCKET } from "abcde-utils/src/addresses";
import { useWebsocketRooms } from "models/websocket";
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
    receiveMessage(event.data);
  });

  wss.addEventListener("error", closeWebSocket);
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

function receiveMessage(message) {
  const m = JSON.parse(message);
  if (m.type === "LOG") {
    updateOutput(m.data);
  } else {
    useWebsocketRooms.getState().setMessage(m.id, m.message);
  }
}

export function sendLocation(pathname) {
  if (wssReady()) {
    wss.send(JSON.stringify({ location: pathname }));
  }
}

export async function sendMessage({ message, id, messageType }) {
  if (wssReady()) {
    wss.send(
      JSON.stringify({
        id,
        message,
        toLocation: "computer:Kevin",
        messageType,
      })
    );
  }
}
