import { useInteractive } from "models/interactive";
import {
  useWebsocketConnectionList,
  useWebsocketRooms,
} from "models/websocket";
import { updateOutput } from "thunks/outputs";
import { updateConnectedTo } from "thunks/websocketConnectionList";
import { WEBSOCKET } from "z_utils/addresses";

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

function closeWebSocket() {
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
  // console.log(m);
  if (m.type === "LOG") {
    updateOutput(m.data);
  } else if (m.messageType === "connection") {
    // console.log("connected as", m["websocketId"]);
  } else if (m.messageType === "allConnections") {
    updateConnectedTo(m);
  } else if (m.messageType === "interactiveProjects") {
    useInteractive.getState().setProjects(m["message"]);
  } else if (m.messageType === "interactive") {
    useInteractive.getState().setData(m["message"]);
  } else if (m.id) {
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
      }),
    );
  }
}
