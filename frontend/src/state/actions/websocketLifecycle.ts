import _ from "lodash";
import { buildFrontendAffinityCurrentAddress } from "state/actions/frontendWebsocketAffinity";
import { C_ADDRESSES } from "utils/c_addresses";
import {
  RouteEnum,
  createWebsocketMsgCurrentAddressUpdate,
} from "utils/generatedTypes";
import { authRecoveryBlocked } from "./websocketAuthRecovery";
import {
  attachWebSocketLifecycleHandlers,
  closeWebSocketForReplacement,
} from "./websocketLifecycleHandlers";
import {
  matchesCurrentWebsocketTarget,
  rememberWebsocketTarget,
  setCurrentWebsocketTarget,
} from "./websocketLifecycleState";
import {
  beginWebsocketGeneration,
  sendMessage,
  websocketTransportState,
  wssReady,
} from "./websocketRuntime";
import { stopShareHeartbeat } from "./websocketShareSessionRecovery";

export const openWebSocket = _.debounce(
  (pathname: string, shareSessionId: string | null = null) => {
    if (authRecoveryBlocked()) {
      return;
    }
    rememberWebsocketTarget(pathname, shareSessionId);
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
      matchesCurrentWebsocketTarget(route, shareSessionId)
    ) {
      sendCurrentAddress(pathname);
      return;
    }
    if (
      websocketTransportState.wss &&
      !matchesCurrentWebsocketTarget(route, shareSessionId)
    ) {
      closeWebSocketForReplacement();
    }
    if (websocketTransportState.wss) {
      return;
    }

    const socketGeneration = beginWebsocketGeneration();
    const socket = new WebSocket(targetUrl);
    websocketTransportState.wss = socket;
    setCurrentWebsocketTarget(route, shareSessionId);
    attachWebSocketLifecycleHandlers({
      socket,
      socketGeneration,
      pathname,
      shareSessionId,
      isDeploymentMode,
      reconnectSocket: openWebSocket,
    });
  },
  1000,
  { leading: true },
);

function sendCurrentAddress(pathname: string) {
  sendMessage(
    createWebsocketMsgCurrentAddressUpdate({
      content: buildFrontendAffinityCurrentAddress(pathname),
    }),
  );
}
