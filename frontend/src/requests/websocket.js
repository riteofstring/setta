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
import {
  addWebsocketConnection,
  clearAllWebsocketConnections,
  setWebsocketConnections,
} from "state/actions/websocketConnectionList";
import { createTemporaryTerminalFromBackend } from "state/hooks/terminals/terminal";
import { URLS } from "utils/constants";

let wss;
let wasOpen = false;

export const openWebSocket = _.debounce(
  (pathname) => {
    if (!wss) {
      wss = new WebSocket(`${URLS.WEBSOCKET}${C.ROUTE_WEBSOCKET_FRONTEND}`);
      wss.addEventListener("open", () => {
        sendLocation(pathname);
        addTemporaryNotification("Connected to server");
        addWebsocketConnection({
          websocketId: "main",
          connectionType: C.WEBSOCKET_CONNECTION_TYPE_SERVER,
        });
        wasOpen = true;
      });

      wss.addEventListener("message", (event) => {
        receiveMessage(event.data);
      });

      wss.addEventListener("error", closeWebSocket);

      wss.addEventListener("close", () => {
        wss = null;
        if (wasOpen) {
          addTemporaryNotification("Server connection lost");
          wasOpen = false;
        }
        clearAllWebsocketConnections();
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
    setWebsocketConnections(m.content);
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
  if (wssReady()) {
    wss.send(
      JSON.stringify({
        id,
        content,
        toWebsocketId: "main",
        messageType,
      }),
    );
  }
}
