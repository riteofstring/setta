import C from "constants/constants.json";
import _ from "lodash";
import {
  updateInteractiveArtifacts,
  updateInteractiveDependencies,
} from "state/actions/interactive";
import { updateJSONSourceContents } from "state/actions/jsonSource";
import {
  addNotificationFromWebsocketMsg,
  addTemporaryNotification,
} from "state/actions/notifications";
import { setTemporaryMiscState } from "state/actions/temporaryMiscState";
import { processTypeErrors } from "state/actions/typeErrors";
import { updateConnectedTo } from "state/actions/websocketConnectionList";
import { useWebsocketConnectionList } from "state/definitions";
import { createTemporaryTerminalFromBackend } from "state/hooks/terminals/terminal";
import { URLS } from "utils/constants";

let wss;

export const openWebSocket = _.debounce(
  (pathname) => {
    if (!wss) {
      wss = new WebSocket(`${URLS.WEBSOCKET}${C.ROUTE_WEBSOCKET_FRONTEND}`);
      wss.addEventListener("open", () => {
        sendLocation(pathname);
        addTemporaryNotification("Websocket connected");
      });

      wss.addEventListener("message", (event) => {
        receiveMessage(event.data);
      });

      wss.addEventListener("error", closeWebSocket);

      wss.addEventListener("close", () => {
        wss = null;
        // Attempt to reconnect
        setTimeout(() => {
          openWebSocket(pathname);
        }, 3000);
      });
    }
  },
  1000,
  { leading: true },
);

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
  if (m.messageType === C.WS_ALL_CONNECTIONS) {
    updateConnectedTo(m.content);
  } else if (m.messageType === C.WS_LSP_DIAGNOSTICS) {
    processTypeErrors(m.content);
  } else if (m.messageType === C.WS_NOTIFICATION) {
    addNotificationFromWebsocketMsg(m.content);
  } else if (m.messageType === C.WS_ARTIFACT) {
    updateInteractiveArtifacts(m.content);
  } else if (m.messageType === C.WS_ALL_DEPENDENCIES) {
    updateInteractiveDependencies(m.content);
  } else if (m.messageType === C.WS_SPECIFIC_FILE_WATCHER_UPDATE) {
    updateJSONSourceContents(m.content);
  } else if (m.messageType === C.WS_CREATE_TEMPORARY_TERMINAL_SECTION) {
    createTemporaryTerminalFromBackend(m.content);
  } else if (m.id) {
    setTemporaryMiscState(m.id, m.content);
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
