import { useInteractive } from "models/interactive";
import { useTypeErrors } from "models/typeErrors";
import {
  useWebsocketConnectionList,
  useWebsocketRooms,
} from "models/websocket";
import { updateOutput } from "state/actions/outputs";
import { updateConnectedTo } from "state/actions/websocketConnectionList";
import { URLS } from "utils/constants";

let wss;

export function openWebSocket(pathname) {
  if (!wss) {
    wss = new WebSocket(URLS.WEBSOCKET);
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
  console.log(m);
  if (m.type === "LOG") {
    updateOutput(m.data);
  } else if (m.messageType === "connection") {
    // console.log("connected as", m["websocketId"]);
  } else if (m.messageType === "allConnections") {
    updateConnectedTo(m);
  } else if (m.messageType === "interactiveProjects") {
    useInteractive.getState().setProjects(m["content"]);
  } else if (m.messageType === "interactive") {
    useInteractive.getState().setData(m["content"]);
  } else if (m.messageType === "diagnostics") {
    useTypeErrors.setState(m.content, true);
  } else if (m.id) {
    useWebsocketRooms.getState().setMessage(m.id, m.content);
  }
}

export function sendLocation(pathname) {
  if (wssReady()) {
    wss.send(JSON.stringify({ location: pathname }));
  }
}

export async function sendMessage({ content, id, messageType }) {
  const connectedTo = useWebsocketConnectionList.getState().connectedTo;
  if (wssReady() && connectedTo) {
    wss.send(
      JSON.stringify({
        id,
        content,
        toWebsocketId: connectedTo,
        messageType,
      }),
    );
  }
}
