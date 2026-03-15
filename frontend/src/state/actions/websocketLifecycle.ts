import _ from "lodash";
import {
  buildFrontendAffinityCurrentAddress,
  clearFrontendWebsocketAffinity,
} from "state/actions/frontendWebsocketAffinity";
import { addTemporaryNotification } from "state/actions/notifications";
import { clearAllWebsocketConnections } from "state/actions/websocketConnectionList";
import { C_ADDRESSES } from "utils/c_addresses";
import {
  RouteEnum,
  createWebsocketMsgCurrentAddressUpdate,
} from "utils/generatedTypes";
import {
  AUTH_CLOSE_CODE,
  authRecoveryBlocked,
  handleAuthSocketClose,
  startAuthRefresh,
  stopAuthRefresh,
} from "./websocketAuthRecovery";
import { bootstrapSocketOpen } from "./websocketBootstrap";
import { receiveFrontendWebsocketMessage } from "./websocketIncomingMessages";
import {
  beginWebsocketGeneration,
  isSocketGenerationCurrent,
  sendMessage,
  sendMessageForGeneration,
  websocketTransportState,
  wssReady,
} from "./websocketRuntime";
import {
  handleShareSessionRecovery,
  isShareSessionRecoveryCloseCode,
  startShareHeartbeat,
  stopShareHeartbeat,
} from "./websocketShareSessionRecovery";

let wasOpen = false;
let lastPathname: string | null = null;
let lastShareSessionId: string | null = null;
let currentShareSessionId: string | null = null;
let currentRoute: string | null = null;

export const openWebSocket = _.debounce(
  (pathname: string, shareSessionId: string | null = null) => {
    if (authRecoveryBlocked()) {
      return;
    }
    lastPathname = pathname;
    lastShareSessionId = shareSessionId;
    const isDeploymentMode = Boolean(shareSessionId);
    if (!isDeploymentMode) {
      stopShareHeartbeat();
    }
    const route = isDeploymentMode
      ? RouteEnum.WEBSOCKET_SHARE_FRONTEND
      : RouteEnum.WEBSOCKET_FRONTEND;
    const targetUrl = isDeploymentMode
      ? `${C_ADDRESSES.WEBSOCKET}${route}?shareSessionId=${encodeURIComponent(
          shareSessionId ?? "",
        )}`
      : `${C_ADDRESSES.WEBSOCKET}${route}`;
    if (
      wssReady(websocketTransportState.wss) &&
      currentRoute === route &&
      currentShareSessionId === shareSessionId
    ) {
      sendCurrentAddress(buildFrontendAffinityCurrentAddress(pathname));
      return;
    }
    if (
      websocketTransportState.wss &&
      (currentRoute !== route || currentShareSessionId !== shareSessionId)
    ) {
      closeWebSocketForReplacement();
    }
    if (websocketTransportState.wss) {
      return;
    }

    const socketGeneration = beginWebsocketGeneration();
    const socket = new WebSocket(targetUrl);
    websocketTransportState.wss = socket;
    const shareSessionIdForSocket = shareSessionId;
    currentShareSessionId = shareSessionId;
    currentRoute = route;

    socket.addEventListener("open", async () => {
      if (
        !isSocketGenerationCurrent(socketGeneration) ||
        websocketTransportState.wss !== socket
      ) {
        return;
      }
      await bootstrapSocketOpen({
        pathname,
        shareSessionId,
        isDeploymentMode,
        sendCurrentAddress,
        startShareHeartbeat: () =>
          startShareHeartbeat({
            getCurrentAddress: () => lastPathname,
            getCurrentShareSessionId: () => currentShareSessionId,
            isSocketReady: () => wssReady(websocketTransportState.wss),
            sendCurrentAddress,
          }),
        startAuthRefresh,
      });
      wasOpen = true;
    });

    socket.addEventListener("message", (event) => {
      if (
        !isSocketGenerationCurrent(socketGeneration) ||
        websocketTransportState.wss !== socket
      ) {
        return;
      }
      if (typeof event.data !== "string") {
        return;
      }
      receiveMessage(event.data, socketGeneration);
    });

    socket.addEventListener("error", () => {
      handleWebSocketTransportError(socket, socketGeneration);
    });

    socket.addEventListener("close", (event: CloseEvent) => {
      handleSocketClose({
        event,
        socket,
        socketGeneration,
        pathname,
        shareSessionIdForSocket,
      });
    });
  },
  1000,
  { leading: true },
);

function handleSocketClose({
  event,
  socket,
  socketGeneration,
  pathname,
  shareSessionIdForSocket,
}: {
  event: CloseEvent;
  socket: WebSocket;
  socketGeneration: number;
  pathname: string;
  shareSessionIdForSocket: string | null;
}) {
  if (!isSocketGenerationCurrent(socketGeneration)) {
    return;
  }
  if (websocketTransportState.wss && websocketTransportState.wss !== socket) {
    return;
  }
  stopAuthRefresh();
  stopShareHeartbeat();
  websocketTransportState.wss = null;
  currentShareSessionId = null;
  currentRoute = null;
  if (isShareSessionRecoveryCloseCode(event.code)) {
    wasOpen = false;
    clearAllWebsocketConnections();
    clearFrontendWebsocketAffinity(socketGeneration);
    if (!shareSessionIdForSocket) {
      return;
    }
    void handleShareSessionRecovery();
    return;
  }
  if (event.code === AUTH_CLOSE_CODE) {
    wasOpen = false;
    clearAllWebsocketConnections();
    clearFrontendWebsocketAffinity(socketGeneration);
    handleAuthSocketClose({
      pathname,
      reconnectSocket: openWebSocket,
      getReconnectTarget: () => ({
        pathname: lastPathname ?? pathname,
        shareSessionId: lastShareSessionId,
      }),
    });
    return;
  }
  if (wasOpen) {
    addTemporaryNotification("Server connection lost");
    wasOpen = false;
  }
  clearAllWebsocketConnections();
  clearFrontendWebsocketAffinity(socketGeneration);
  setTimeout(() => {
    openWebSocket(lastPathname ?? pathname, lastShareSessionId);
  }, 3000);
}

function closeWebSocketForReplacement() {
  const socketGeneration = beginWebsocketGeneration();
  if (websocketTransportState.wss) {
    websocketTransportState.wss.close();
    websocketTransportState.wss = null;
  }
  clearFrontendWebsocketAffinity(socketGeneration);
  stopAuthRefresh();
  stopShareHeartbeat();
}

function handleWebSocketTransportError(
  socket: WebSocket,
  socketGeneration: number,
) {
  if (!isSocketGenerationCurrent(socketGeneration)) {
    return;
  }
  if (websocketTransportState.wss !== socket) {
    return;
  }
  if (
    socket.readyState === WebSocket.CLOSED ||
    socket.readyState === WebSocket.CLOSING
  ) {
    return;
  }
  socket.close();
}

function receiveMessage(message: string, socketGeneration: number) {
  receiveFrontendWebsocketMessage(message, {
    socketGeneration,
    isSocketGenerationCurrent,
    isSocketOpen: () => wssReady(websocketTransportState.wss),
    sendMessageForGeneration,
  });
}

function sendCurrentAddress(currentAddress: string) {
  sendMessage(
    createWebsocketMsgCurrentAddressUpdate({ content: currentAddress }),
  );
}
