import { useEffect, useRef } from "react";
import { getCurrProjectConfigId } from "state/actions/sectionInfos";
import { useShareSession } from "state/definitions";
import { C } from "utils/c";
import { C_ADDRESSES } from "utils/c_addresses";
import { replaceAddressParams } from "utils/endpointUtils";
import { RouteEnum } from "utils/generatedTypes";
import { createNewId } from "utils/idNameCreation";
import {
  clearPendingSectionTextFocus,
  isPendingSectionTextFocus,
} from "utils/tabbingLogic";
import { Terminal } from "xterm";
import { AttachAddon } from "xterm-addon-attach";
import { FitAddon } from "xterm-addon-fit";
import "xterm/css/xterm.css";
import {
  scrollSensitivityUpdater,
  terminalCleanup,
  terminalTheme,
} from "./utils";

type TerminalSessionKey = string;

type TerminalSession = {
  key: TerminalSessionKey;
  projectConfigId: string;
  sectionId: string;
  shareSessionId: string | null;
  isShareMode: boolean;
  terminal: Terminal;
  fitAddon: FitAddon;
  ws: WebSocket;
  wsId: string;
  refCount: number;
  disposeTimer: number | null;
};

const TERMINAL_SESSIONS: Record<TerminalSessionKey, TerminalSession> = {};
const INITIAL_MESSAGES: Record<string, string[]> = {}; // maps from sectionId to a list of messages

const TERMINAL_SESSION_DISPOSE_DELAY_MS = 750;

function buildTerminalSessionKey({
  projectConfigId,
  sectionId,
  isShareMode,
  shareSessionId,
}: {
  projectConfigId: string;
  sectionId: string;
  isShareMode: boolean;
  shareSessionId: string | null;
}): TerminalSessionKey {
  const shareKey = isShareMode ? `share:${shareSessionId ?? ""}` : "local";
  return `${projectConfigId}::${sectionId}::${shareKey}`;
}

function attachExistingTerminalElementToContainer(
  terminal: Terminal,
  container: HTMLElement,
) {
  const element = terminal.element;
  if (!element) {
    return false;
  }
  if (container.contains(element)) {
    return true;
  }
  container.textContent = "";
  container.appendChild(element);
  return true;
}

function ensureTerminalSession({
  projectConfigId,
  sectionId,
  isShareMode,
  shareSessionId,
}: {
  projectConfigId: string;
  sectionId: string;
  isShareMode: boolean;
  shareSessionId: string | null;
}): TerminalSession {
  const key = buildTerminalSessionKey({
    projectConfigId,
    sectionId,
    isShareMode,
    shareSessionId,
  });
  const existing = TERMINAL_SESSIONS[key];
  if (existing) {
    if (existing.disposeTimer !== null) {
      window.clearTimeout(existing.disposeTimer);
      existing.disposeTimer = null;
    }
    existing.refCount += 1;
    return existing;
  }

  const terminal = new Terminal({
    cursorBlink: true,
    theme: terminalTheme,
    disableStdin: isShareMode,
  });
  const fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);

  const { ws, wsId } = createTerminalWebsocket({
    projectConfigId,
    sectionId,
    shareSessionId,
    isShareMode,
    terminal,
  });

  const session: TerminalSession = {
    key,
    projectConfigId,
    sectionId,
    shareSessionId,
    isShareMode,
    terminal,
    fitAddon,
    ws,
    wsId,
    refCount: 1,
    disposeTimer: null,
  };
  TERMINAL_SESSIONS[key] = session;
  return session;
}

function releaseTerminalSession(key: TerminalSessionKey) {
  const session = TERMINAL_SESSIONS[key];
  if (!session) {
    return;
  }
  session.refCount = Math.max(0, session.refCount - 1);
  if (session.refCount > 0) {
    return;
  }
  if (session.disposeTimer !== null) {
    window.clearTimeout(session.disposeTimer);
  }
  session.disposeTimer = window.setTimeout(() => {
    const latest = TERMINAL_SESSIONS[key];
    if (!latest) {
      return;
    }
    if (latest.refCount > 0) {
      return;
    }
    delete TERMINAL_SESSIONS[key];
    terminalCleanup(latest.ws, latest.terminal);
  }, TERMINAL_SESSION_DISPOSE_DELAY_MS);
}

export function useTerminal({
  sectionId,
  width,
  height,
  setHasScrollbar,
}: {
  sectionId: string;
  width: number;
  height: number;
  setHasScrollbar: (value: boolean) => void;
}) {
  const terminalRef = useRef<HTMLDivElement | null>(null); // Ref for the terminal container
  const sessionKeyRef = useRef<TerminalSessionKey | null>(null);
  const sessionRef = useRef<TerminalSession | null>(null);
  const isShareMode = useShareSession((x) => x.isShareMode);
  const shareSessionId = useShareSession((x) => x.shareSessionId);

  useEffect(() => {
    sessionRef.current = null;
    if (isShareMode && !shareSessionId) {
      clearPendingSectionTextFocus(sectionId);
      return;
    }
    const projectConfigId = getCurrProjectConfigId();
    const session = ensureTerminalSession({
      projectConfigId,
      sectionId,
      isShareMode,
      shareSessionId,
    });
    sessionKeyRef.current = session.key;
    sessionRef.current = session;

    const container = terminalRef.current;
    if (container) {
      const attached = attachExistingTerminalElementToContainer(
        session.terminal,
        container,
      );
      if (!attached) {
        session.terminal.open(container);
      }
      // `open()` does not guarantee the terminal is sized correctly; fit after
      // a layout tick so detached/attached transitions don't jitter.
      requestAnimationFrame(() => {
        session.fitAddon.fit();
      });
    }

    const focusTerminalInput = (attempt = 0) => {
      if (!isPendingSectionTextFocus(sectionId)) {
        return;
      }
      const focusTarget = terminalRef.current?.querySelector?.(
        ".xterm-helper-textarea, .xterm textarea",
      );
      if (focusTarget instanceof HTMLElement) {
        focusTarget.focus({ preventScroll: true });
        session.terminal.focus();
        const active = document.activeElement;
        if (
          terminalRef.current &&
          active instanceof HTMLElement &&
          terminalRef.current.contains(active)
        ) {
          clearPendingSectionTextFocus(sectionId);
          return;
        }
      }
      session.terminal.focus();
      if (attempt < 240) {
        requestAnimationFrame(() => focusTerminalInput(attempt + 1));
      } else {
        clearPendingSectionTextFocus(sectionId);
      }
    };

    if (!isShareMode && isPendingSectionTextFocus(sectionId)) {
      requestAnimationFrame(() => focusTerminalInput());
    }

    const ws = session.ws;
    const resizeDisposable = session.terminal.onResize((size) => {
      // Send the new size to the backend
      const message = JSON.stringify({
        messageType: C.WS_TERMINAL_RESIZE,
        cols: size.cols,
        rows: size.rows,
      });
      if (ws.readyState === 1) {
        ws.send(message);
      } else {
        addTerminalInitialMessage(sectionId, message);
      }
    });

    function onInitialMessage(message: MessageEvent) {
      if (message.data === C.SETTA_TERMINAL_READY) {
        if (!isShareMode && isPendingSectionTextFocus(sectionId)) {
          requestAnimationFrame(() => focusTerminalInput());
        }
        ws.removeEventListener("message", onInitialMessage);
      }
    }

    ws.addEventListener("message", onInitialMessage);

    const unsub = scrollSensitivityUpdater(session.terminal, setHasScrollbar);

    return () => {
      clearPendingSectionTextFocus(sectionId);
      ws.removeEventListener("message", onInitialMessage);
      resizeDisposable.dispose();
      unsub();
      const key = sessionKeyRef.current;
      sessionKeyRef.current = null;
      if (key) {
        releaseTerminalSession(key);
      }
    };
  }, [sectionId, isShareMode, shareSessionId, setHasScrollbar]);

  useEffect(() => {
    sessionRef.current?.fitAddon.fit();
  }, [width, height]);

  return terminalRef;
}

function createTerminalWebsocket({
  projectConfigId,
  sectionId,
  shareSessionId,
  isShareMode,
  terminal,
}: {
  projectConfigId: string;
  sectionId: string;
  shareSessionId: string | null;
  isShareMode: boolean;
  terminal: Terminal;
}) {
  const id = createNewId();
  const baseAddress = `${C_ADDRESSES.WEBSOCKET}${replaceAddressParams(
    RouteEnum.TERMINAL,
    { projectConfigId, sectionId, id },
  )}`;
  const wsTerminalAddress = shareSessionId
    ? `${baseAddress}?shareSessionId=${encodeURIComponent(shareSessionId)}`
    : baseAddress;
  const ws = new WebSocket(wsTerminalAddress);
  ws.addEventListener("open", async () => {
    if (INITIAL_MESSAGES[sectionId]?.length > 0) {
      const sentMessageIdx = [];
      for (const [idx, initialMessage] of INITIAL_MESSAGES[
        sectionId
      ].entries()) {
        // hack to get backend to receive distinct messages rather than 1 grouped message
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (ws.readyState === 1) {
          ws.send(initialMessage);
          sentMessageIdx.push(idx);
        }
      }
      INITIAL_MESSAGES[sectionId] = INITIAL_MESSAGES[sectionId].filter(
        (x, idx) => !sentMessageIdx.includes(idx),
      );
    }
  });

  function onInitialMessage(message: MessageEvent) {
    if (message.data === C.SETTA_TERMINAL_READY) {
      const attachAddon = new AttachAddon(ws, {
        bidirectional: !isShareMode,
      });
      terminal.loadAddon(attachAddon);
      ws.removeEventListener("message", onInitialMessage);
    }
  }
  ws.addEventListener("message", onInitialMessage);

  return { ws, wsId: id };
}

// const fontFamily = {
//   fontFamily:
//     'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;',
// };

function addTerminalInitialMessage(sectionId, msg) {
  if (!(sectionId in INITIAL_MESSAGES)) {
    INITIAL_MESSAGES[sectionId] = [];
  }
  if (!INITIAL_MESSAGES[sectionId].includes(msg)) {
    INITIAL_MESSAGES[sectionId].push(msg);
  }
}
