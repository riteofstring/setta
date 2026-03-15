import { clearFrontendWebsocketAffinity } from "state/actions/frontendWebsocketAffinity";
import { addTemporaryNotification } from "state/actions/notifications";
import { clearAllWebsocketConnections } from "state/actions/websocketConnectionList";
import { createWebsocketMsgCurrentAddressUpdate } from "utils/generatedTypes";
import {
  AUTH_CLOSE_CODE,
  handleAuthSocketClose,
  startAuthRefresh,
  stopAuthRefresh,
} from "./websocketAuthRecovery";
import { bootstrapSocketOpen } from "./websocketBootstrap";
import { receiveFrontendWebsocketMessage } from "./websocketIncomingMessages";
import {
  clearCurrentWebsocketTarget,
  clearWasWebsocketOpen,
  consumeWasWebsocketOpen,
  getCurrentWebsocketShareSessionId,
  getLastWebsocketPathname,
  getLastWebsocketTarget,
  markWebsocketOpen,
} from "./websocketLifecycleState";
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

const WEBSOCKET_RECONNECT_DELAY_MS = 3000;

export function attachWebSocketLifecycleHandlers({
  socket,
  socketGeneration,
  pathname,
  shareSessionId,
  isDeploymentMode,
  reconnectSocket,
}: {
  socket: WebSocket;
  socketGeneration: number;
  pathname: string;
  shareSessionId: string | null;
  isDeploymentMode: boolean;
  reconnectSocket: (pathname: string, shareSessionId?: string | null) => void;
}): void {
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
          getCurrentAddress: getLastWebsocketPathname,
          getCurrentShareSessionId: getCurrentWebsocketShareSessionId,
          isSocketReady: () => wssReady(websocketTransportState.wss),
          sendCurrentAddress,
        }),
      startAuthRefresh,
    });
    markWebsocketOpen();
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
      shareSessionIdForSocket: shareSessionId,
      reconnectSocket,
    });
  });
}

export function closeWebSocketForReplacement(): void {
  const socketGeneration = beginWebsocketGeneration();
  if (websocketTransportState.wss) {
    websocketTransportState.wss.close();
    websocketTransportState.wss = null;
  }
  clearFrontendWebsocketAffinity(socketGeneration);
  stopAuthRefresh();
  stopShareHeartbeat();
  clearCurrentWebsocketTarget();
}

function handleSocketClose({
  event,
  socket,
  socketGeneration,
  pathname,
  shareSessionIdForSocket,
  reconnectSocket,
}: {
  event: CloseEvent;
  socket: WebSocket;
  socketGeneration: number;
  pathname: string;
  shareSessionIdForSocket: string | null;
  reconnectSocket: (pathname: string, shareSessionId?: string | null) => void;
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
  clearCurrentWebsocketTarget();
  if (isShareSessionRecoveryCloseCode(event.code)) {
    clearWasWebsocketOpen();
    clearAllWebsocketConnections();
    clearFrontendWebsocketAffinity(socketGeneration);
    if (!shareSessionIdForSocket) {
      return;
    }
    void handleShareSessionRecovery();
    return;
  }
  if (event.code === AUTH_CLOSE_CODE) {
    clearWasWebsocketOpen();
    clearAllWebsocketConnections();
    clearFrontendWebsocketAffinity(socketGeneration);
    handleAuthSocketClose({
      pathname,
      reconnectSocket,
      getReconnectTarget: () => getLastWebsocketTarget(pathname),
    });
    return;
  }
  if (consumeWasWebsocketOpen()) {
    addTemporaryNotification("Server connection lost");
  }
  clearAllWebsocketConnections();
  clearFrontendWebsocketAffinity(socketGeneration);
  window.setTimeout(() => {
    const reconnectTarget = getLastWebsocketTarget(pathname);
    reconnectSocket(reconnectTarget.pathname, reconnectTarget.shareSessionId);
  }, WEBSOCKET_RECONNECT_DELAY_MS);
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
