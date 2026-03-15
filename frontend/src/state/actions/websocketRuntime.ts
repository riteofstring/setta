import {
  clearFrontendWebsocketAffinity,
  setActiveFrontendWebsocketAffinityGeneration,
} from "state/actions/frontendWebsocketAffinity";
import { encodeBinaryFrame } from "utils/binaryWebsocket";
import { WebsocketMsg } from "utils/generatedTypes";

export const websocketTransportState = {
  wss: null as WebSocket | null,
  activeWebsocketGeneration: 0,
};

export function beginWebsocketGeneration(): number {
  websocketTransportState.activeWebsocketGeneration += 1;
  setActiveFrontendWebsocketAffinityGeneration(
    websocketTransportState.activeWebsocketGeneration,
  );
  clearFrontendWebsocketAffinity(
    websocketTransportState.activeWebsocketGeneration,
  );
  return websocketTransportState.activeWebsocketGeneration;
}

export function wssReady(socket: WebSocket | null): socket is WebSocket {
  return socket !== null && socket.readyState === WebSocket.OPEN;
}

export function isSocketGenerationCurrent(socketGeneration: number): boolean {
  return websocketTransportState.activeWebsocketGeneration === socketGeneration;
}

export function sendMessage(message: WebsocketMsg): void {
  if (!wssReady(websocketTransportState.wss)) {
    return;
  }
  websocketTransportState.wss.send(JSON.stringify(message));
}

export function sendMessageForGeneration(
  message: WebsocketMsg,
  socketGeneration: number,
): void {
  if (!isSocketGenerationCurrent(socketGeneration)) {
    return;
  }
  sendMessage(message);
}

export function sendBinaryMessage(
  message: WebsocketMsg,
  payload: ArrayBuffer,
): void {
  if (!wssReady(websocketTransportState.wss)) {
    return;
  }
  const frame = encodeBinaryFrame(message, payload);
  websocketTransportState.wss.send(frame);
}
