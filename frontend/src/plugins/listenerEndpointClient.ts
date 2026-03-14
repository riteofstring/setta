import {
  buildPluginListenerWebsocketUrl,
  type BuildPluginListenerWebsocketUrlOptions,
} from "./transport";

const LISTENER_REGISTER_MESSAGE_TYPE = "ListenerRegister";
const LISTENER_REGISTER_ACK_MESSAGE_TYPE = "ListenerRegisterAck";
const LISTENER_ROUTER_CALL_MESSAGE_TYPE = "ListenerRouterEndpointCall";
const LISTENER_ROUTER_RESULT_MESSAGE_TYPE = "ListenerRouterEndpointResult";

type ListenerEnvelope = {
  messageType?: unknown;
  content?: unknown;
};

type ListenerRouterResultEnvelope = {
  messageType: string;
  content: {
    projectConfigId?: unknown;
    callId?: unknown;
    ok?: unknown;
    result?: unknown;
    error?: unknown;
    details?: unknown;
  };
};

export type BuildListenerEndpointWebsocketUrlOptions =
  BuildPluginListenerWebsocketUrlOptions;

export type CallListenerEndpointOverWebsocketOptions = {
  listenerId: string;
  projectConfigId: string;
  endpointName: string;
  payload: Record<string, unknown>;
  shareSessionId: string | null;
};

export function buildListenerEndpointWebsocketUrl({
  listenerId,
  projectConfigId,
  shareSessionId,
}: BuildListenerEndpointWebsocketUrlOptions): string {
  return buildPluginListenerWebsocketUrl({
    listenerId,
    projectConfigId,
    shareSessionId,
  });
}

export function callListenerEndpointOverWebsocket({
  listenerId,
  projectConfigId,
  endpointName,
  payload,
  shareSessionId,
}: CallListenerEndpointOverWebsocketOptions): Promise<unknown> {
  const websocket = new WebSocket(
    buildListenerEndpointWebsocketUrl({
      listenerId,
      projectConfigId,
      shareSessionId,
    }),
  );
  const callId = crypto.randomUUID();

  return new Promise<unknown>((resolve, reject) => {
    let registerAcknowledged = false;
    let settled = false;

    const cleanup = (): void => {
      websocket.removeEventListener("open", handleOpen);
      websocket.removeEventListener("message", handleMessage);
      websocket.removeEventListener("error", handleError);
      websocket.removeEventListener("close", handleClose);
    };

    const settle = (
      outcome:
        | { kind: "resolve"; value: unknown }
        | { kind: "reject"; error: Error },
    ): void => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      if (
        websocket.readyState === WebSocket.CONNECTING ||
        websocket.readyState === WebSocket.OPEN
      ) {
        websocket.close();
      }
      if (outcome.kind === "resolve") {
        resolve(outcome.value);
        return;
      }
      reject(outcome.error);
    };

    const handleOpen = (): void => {
      websocket.send(
        JSON.stringify({
          messageType: LISTENER_REGISTER_MESSAGE_TYPE,
          content: {
            callbacks: {},
          },
        }),
      );
    };

    const handleMessage = (event: MessageEvent): void => {
      if (typeof event.data !== "string") {
        return;
      }
      const envelope = parseListenerEnvelope(event.data);
      if (!envelope) {
        return;
      }

      if (envelope.messageType === LISTENER_REGISTER_ACK_MESSAGE_TYPE) {
        if (registerAcknowledged) {
          return;
        }
        registerAcknowledged = true;
        websocket.send(
          JSON.stringify({
            messageType: LISTENER_ROUTER_CALL_MESSAGE_TYPE,
            content: {
              projectConfigId,
              callId,
              endpointName,
              payload,
            },
          }),
        );
        return;
      }

      if (envelope.messageType !== LISTENER_ROUTER_RESULT_MESSAGE_TYPE) {
        return;
      }

      const resultEnvelope = envelope as ListenerRouterResultEnvelope;
      if (resultEnvelope.content.callId !== callId) {
        return;
      }
      if (resultEnvelope.content.ok === true) {
        settle({
          kind: "resolve",
          value: resultEnvelope.content.result,
        });
        return;
      }

      settle({
        kind: "reject",
        error: new Error(
          formatListenerEndpointError(endpointName, resultEnvelope.content),
        ),
      });
    };

    const handleError = (): void => {
      settle({
        kind: "reject",
        error: new Error(
          `Listener endpoint websocket failed before ${endpointName} completed.`,
        ),
      });
    };

    const handleClose = (event: CloseEvent): void => {
      settle({
        kind: "reject",
        error: new Error(
          formatListenerEndpointCloseError({
            endpointName,
            code: event.code,
            reason: event.reason,
          }),
        ),
      });
    };

    websocket.addEventListener("open", handleOpen);
    websocket.addEventListener("message", handleMessage);
    websocket.addEventListener("error", handleError);
    websocket.addEventListener("close", handleClose);
  });
}

function parseListenerEnvelope(rawMessage: string): ListenerEnvelope | null {
  let parsedMessage: unknown;
  try {
    parsedMessage = JSON.parse(rawMessage) as unknown;
  } catch {
    return null;
  }
  if (!parsedMessage || typeof parsedMessage !== "object") {
    return null;
  }
  return parsedMessage as ListenerEnvelope;
}

function formatListenerEndpointError(
  endpointName: string,
  content: ListenerRouterResultEnvelope["content"],
): string {
  const rawError = content.error;
  const errorCode =
    typeof rawError === "string" && rawError.trim() !== ""
      ? rawError.trim()
      : "listener_call_failed";
  const details = content.details;
  if (
    details &&
    typeof details === "object" &&
    "message" in details &&
    typeof details.message === "string" &&
    details.message.trim() !== ""
  ) {
    return `Listener endpoint ${endpointName} failed: ${errorCode} (${details.message.trim()})`;
  }
  return `Listener endpoint ${endpointName} failed: ${errorCode}`;
}

function formatListenerEndpointCloseError({
  endpointName,
  code,
  reason,
}: {
  endpointName: string;
  code: number;
  reason: string;
}): string {
  const trimmedReason = reason.trim();
  if (trimmedReason !== "") {
    return `Listener endpoint websocket closed before ${endpointName} completed: ${code} ${trimmedReason}`;
  }
  return `Listener endpoint websocket closed before ${endpointName} completed: ${code}`;
}
