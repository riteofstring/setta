import C from "constants/constants.json";
import { setInteractiveData } from "state/actions/interactive";
import { updateConnectedTo } from "state/actions/websocket/websocketConnectionList";
import { setWebsocketRoomMessage } from "state/actions/websocket/websocketRooms";
import { useTypeErrors, useWebsocketConnectionList } from "state/definitions";
import { URLS } from "utils/constants";

let wss;

export function openWebSocket(pathname) {
  if (!wss) {
    wss = new WebSocket(`${URLS.WEBSOCKET}${C.ROUTE_WEBSOCKET_MANAGER}`);
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
  if (m.messageType === C.WS_ALL_CONNECTIONS) {
    updateConnectedTo(m);
  } else if (m.messageType === "interactive") {
    setInteractiveData(m["content"]);
  } else if (m.messageType === C.WS_LSP_DIAGNOSTICS) {
    useTypeErrors.setState(m.content, true);
  } else if (m.id) {
    setWebsocketRoomMessage(m.id, m.content);
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
