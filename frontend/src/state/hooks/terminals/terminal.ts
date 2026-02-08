import { useEffect, useRef } from "react";
import { getCurrProjectConfigId } from "state/actions/sectionInfos";
import { useMisc, useShareSession } from "state/definitions";
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
import { terminalCleanup, terminalTheme } from "./utils";

// Maps from sectionId to a list of websocket connections.
// There should only be 1 websocket for a given section.
// But in case of double renders (basically just StrictMode),
// this keeps a list of websockets, so we can add the new websocket
// while the old one gets deleted.
const TERMINAL_WEBSOCKETS = {};
const INITIAL_MESSAGES = {}; // maps from sectionId to a list of messages

type TerminalSession = {
  terminal: Terminal;
  fitAddon: FitAddon;
  ws: WebSocket;
  wsId: string;
  isShareMode: boolean;
  shareSessionId: string | null;
  refCount: number;
  cleanupTimeoutId: number | null;
  parkedHost: HTMLDivElement;
  setHasScrollbar: ((value: boolean) => void) | null;
  scrollUnsub: (() => void) | null;
};

// Keep terminals alive briefly across unmount/mount transitions (e.g. detach/attach)
// to avoid reconnecting and replaying terminal history.
const TERMINAL_SESSIONS: Record<string, TerminalSession> = {};
const TERMINAL_SESSION_CLEANUP_DELAY_MS = 2000;

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
  const sessionRef = useRef<TerminalSession | null>(null);
  const isShareMode = useShareSession((x) => x.isShareMode);
  const shareSessionId = useShareSession((x) => x.shareSessionId);

  useEffect(() => {
    sessionRef.current = null;
    if (isShareMode && !shareSessionId) {
      clearPendingSectionTextFocus(sectionId);
      return;
    }
    const host = terminalRef.current;
    if (!host) {
      clearPendingSectionTextFocus(sectionId);
      return;
    }

    const focusTerminalInput = (attempt = 0) => {
      if (!isPendingSectionTextFocus(sectionId)) {
        return;
      }
      const focusTarget = host.querySelector?.(
        ".xterm-helper-textarea, .xterm textarea",
      );
      if (focusTarget instanceof HTMLElement) {
        focusTarget.focus({ preventScroll: true });
        sessionRef.current?.terminal.focus();
        const active = document.activeElement;
        if (
          sessionRef.current &&
          active instanceof HTMLElement &&
          host.contains(active)
        ) {
          clearPendingSectionTextFocus(sectionId);
          return;
        }
      }
      sessionRef.current?.terminal.focus();
      if (attempt < 240) {
        requestAnimationFrame(() => focusTerminalInput(attempt + 1));
      } else {
        clearPendingSectionTextFocus(sectionId);
      }
    };

    if (!isShareMode && isPendingSectionTextFocus(sectionId)) {
      requestAnimationFrame(() => focusTerminalInput());
    }

    let session = TERMINAL_SESSIONS[sectionId] ?? null;
    if (
      session &&
      (session.isShareMode !== isShareMode ||
        session.shareSessionId !== shareSessionId)
    ) {
      cleanupTerminalSession(sectionId, session);
      session = null;
    }

    if (!session) {
      const terminal = new Terminal({
        cursorBlink: true,
        theme: terminalTheme,
        disableStdin: isShareMode,
      });
      const fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);
      terminal.open(host);

      const { ws, wsId } = newTerminalWebsocket(sectionId, shareSessionId);

      terminal.onResize((size) => {
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

      const parkedHost = document.createElement("div");
      parkedHost.style.position = "fixed";
      parkedHost.style.left = "-100000px";
      parkedHost.style.top = "0";
      parkedHost.style.width = "20px";
      parkedHost.style.height = "20px";
      parkedHost.style.overflow = "hidden";
      parkedHost.style.opacity = "0";
      parkedHost.style.pointerEvents = "none";
      document.body.appendChild(parkedHost);

      session = {
        terminal,
        fitAddon,
        ws,
        wsId,
        isShareMode,
        shareSessionId,
        refCount: 0,
        cleanupTimeoutId: null,
        parkedHost,
        setHasScrollbar: null,
        scrollUnsub: null,
      };
      TERMINAL_SESSIONS[sectionId] = session;

      // Keep scroll sensitivity in sync with pan-scrolling, independent of mount lifetime.
      session.scrollUnsub = useMisc.subscribe(
        (state) => state.isPanScrolling,
        (isPanScrolling) => {
          terminal.options.scrollSensitivity = isPanScrolling
            ? Number.MIN_VALUE
            : 1;
        },
      );
      terminal.onRender(() => {
        session?.setHasScrollbar?.(terminal.buffer.active.baseY > 0);
      });

      function onInitialMessage(message: MessageEvent) {
        if (message.data === C.SETTA_TERMINAL_READY) {
          const attachAddon = new AttachAddon(ws, {
            bidirectional: !isShareMode,
          });
          terminal.loadAddon(attachAddon);
          if (!isShareMode && isPendingSectionTextFocus(sectionId)) {
            requestAnimationFrame(() => focusTerminalInput());
          }
          ws.removeEventListener("message", onInitialMessage);
        }
      }

      ws.addEventListener("message", onInitialMessage);
    } else {
      if (session.cleanupTimeoutId !== null) {
        clearTimeout(session.cleanupTimeoutId);
        session.cleanupTimeoutId = null;
      }
      const terminalElement = session.terminal.element;
      if (terminalElement) {
        host.replaceChildren(terminalElement);
      }
    }

    session.setHasScrollbar = setHasScrollbar;
    session.refCount += 1;
    sessionRef.current = session;

    return () => {
      clearPendingSectionTextFocus(sectionId);
      session.setHasScrollbar = null;
      session.refCount = Math.max(0, session.refCount - 1);
      if (session.terminal.element) {
        session.parkedHost.replaceChildren(session.terminal.element);
      }
      if (session.refCount === 0 && session.cleanupTimeoutId === null) {
        session.cleanupTimeoutId = window.setTimeout(() => {
          const current = TERMINAL_SESSIONS[sectionId];
          if (current !== session) {
            return;
          }
          if (session.refCount !== 0) {
            return;
          }
          cleanupTerminalSession(sectionId, session);
        }, TERMINAL_SESSION_CLEANUP_DELAY_MS);
      }
    };
  }, [isShareMode, sectionId, shareSessionId, setHasScrollbar]);

  useEffect(() => {
    sessionRef.current?.fitAddon.fit();
  }, [width, height]);

  return terminalRef;
}

function cleanupTerminalSession(sectionId: string, session: TerminalSession) {
  if (session.cleanupTimeoutId !== null) {
    clearTimeout(session.cleanupTimeoutId);
    session.cleanupTimeoutId = null;
  }
  session.setHasScrollbar = null;
  if (session.scrollUnsub) {
    session.scrollUnsub();
    session.scrollUnsub = null;
  }
  try {
    if (session.parkedHost.parentNode) {
      session.parkedHost.remove();
    }
  } catch {
    // Ignore DOM cleanup issues.
  }
  terminalCleanup(session.ws, session.terminal);
  delete TERMINAL_SESSIONS[sectionId];
}

function newTerminalWebsocket(
  sectionId: string,
  shareSessionId: string | null,
) {
  const projectConfigId = getCurrProjectConfigId();
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

  function cleanupTerminalWebsockets() {
    if (sectionId in TERMINAL_WEBSOCKETS) {
      TERMINAL_WEBSOCKETS[sectionId] = removeWsFromArray(
        TERMINAL_WEBSOCKETS[sectionId],
        ws,
      );
    }
  }

  ws.addEventListener("close", cleanupTerminalWebsockets);
  ws.addEventListener("error", cleanupTerminalWebsockets);

  if (!(sectionId in TERMINAL_WEBSOCKETS)) {
    TERMINAL_WEBSOCKETS[sectionId] = [];
  }
  TERMINAL_WEBSOCKETS[sectionId].push(ws);

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

function removeWsFromArray(x, ws) {
  return x.filter((w) => w !== ws);
}
