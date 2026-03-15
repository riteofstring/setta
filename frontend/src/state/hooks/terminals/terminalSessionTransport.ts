import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { useShareSession } from "state/definitions";
import { C } from "utils/c";
import { C_ADDRESSES } from "utils/c_addresses";
import { replaceAddressParams } from "utils/endpointUtils";
import { RouteEnum } from "utils/generatedTypes";
import { createNewId } from "utils/idNameCreation";
import { terminalTheme } from "./utils";

export type TerminalSession = {
  ws: WebSocket;
  refCount: number;
  closeTimeoutId: number | null;
  isReady: boolean;
  terminal: Terminal;
  fitAddon: FitAddon;
  inputDisposable: { dispose: () => void };
  resizeDisposable: { dispose: () => void };
  pendingResizeMessage: string | null;
  pendingResizeTimeoutId: number | null;
  lastSentResizeMessage: string | null;
  lastSentResizeTs: number | null;
};

type CreateBootstrappedTerminalSessionParams = {
  sessionKey: string;
  projectConfigId: string;
  sectionId: string;
  shareSessionId: string | null;
  isDeploymentMode: boolean;
  container: HTMLDivElement;
  getCurrentSession: (sessionKey: string) => TerminalSession | undefined;
  queueResize: (sessionKey: string, message: string) => void;
  flushResize: (sessionKey: string) => void;
};

export function createBootstrappedTerminalSession({
  sessionKey,
  projectConfigId,
  sectionId,
  shareSessionId,
  isDeploymentMode,
  container,
  getCurrentSession,
  queueResize,
  flushResize,
}: CreateBootstrappedTerminalSessionParams): TerminalSession {
  const id = createNewId();
  const terminal = new Terminal({
    cursorBlink: true,
    theme: terminalTheme,
    disableStdin: isDeploymentMode,
  });
  const fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  terminal.open(container);

  const baseAddress = `${C_ADDRESSES.WEBSOCKET}${replaceAddressParams(
    RouteEnum.TERMINAL,
    { projectConfigId, sectionId, id },
  )}`;
  const wsTerminalAddress = shareSessionId
    ? `${baseAddress}?shareSessionId=${encodeURIComponent(shareSessionId)}`
    : baseAddress;
  const ws = new WebSocket(wsTerminalAddress);

  const session: TerminalSession = {
    ws,
    refCount: 1,
    closeTimeoutId: null,
    isReady: false,
    terminal,
    fitAddon,
    inputDisposable: terminal.onData(() => {}),
    resizeDisposable: terminal.onResize(() => {}),
    pendingResizeMessage: null,
    pendingResizeTimeoutId: null,
    lastSentResizeMessage: null,
    lastSentResizeTs: null,
  };

  session.inputDisposable.dispose();
  session.inputDisposable = terminal.onData((data) => {
    const shareSession = useShareSession.getState();
    if (shareSession.isDeploymentMode) {
      return;
    }
    if (!session.isReady) {
      return;
    }
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  });

  session.resizeDisposable.dispose();
  session.resizeDisposable = terminal.onResize((size) => {
    const message = JSON.stringify({
      messageType: C.WS_TERMINAL_RESIZE,
      cols: size.cols,
      rows: size.rows,
    });
    queueResize(sessionKey, message);
  });

  ws.addEventListener("open", () => {
    if (getCurrentSession(sessionKey) !== session) {
      return;
    }
    flushResize(sessionKey);
  });

  ws.addEventListener("message", (event: MessageEvent) => {
    if (getCurrentSession(sessionKey) !== session) {
      return;
    }
    if (
      typeof event.data === "string" &&
      event.data === C.SETTA_TERMINAL_READY
    ) {
      session.isReady = true;
      return;
    }
    appendTerminalMessage(
      session,
      event.data,
      () => getCurrentSession(sessionKey) === session,
    );
  });

  return session;
}

function appendTerminalMessage(
  session: TerminalSession,
  data: unknown,
  isCurrentSession: () => boolean,
) {
  const appendText = (text: string) => {
    if (!text) {
      return;
    }
    session.terminal.write(text);
  };

  if (typeof data === "string") {
    appendText(data);
    return;
  }
  if (data instanceof ArrayBuffer) {
    appendText(new TextDecoder().decode(data));
    return;
  }
  if (data instanceof Blob) {
    data
      .arrayBuffer()
      .then((buffer) => {
        if (!isCurrentSession()) {
          return;
        }
        appendText(new TextDecoder().decode(buffer));
      })
      .catch(() => {
        // Ignore decode errors.
      });
  }
}
