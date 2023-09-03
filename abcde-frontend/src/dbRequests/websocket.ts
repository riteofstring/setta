import { WEBSOCKET } from "abcde-utils/src/addresses";
import {
  useWebsocketConnectionList,
  useWebsocketRooms,
} from "models/websocket";
import { updateOutput } from "thunks/outputs";
import { updateConnectedTo } from "thunks/websocketConnectionList";

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
  } else if (m.messageType === "connection") {
    // receives websocketId
  } else if (m.messageType === "allConnections") {
    updateConnectedTo(m);
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
  const connectedTo = useWebsocketConnectionList.getState().connectedTo;
  if (wssReady() && connectedTo) {
    wss.send(
      JSON.stringify({
        id,
        message,
        toWebsocketId: connectedTo,
        messageType,
      })
    );
  }
}
