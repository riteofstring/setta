import type { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import type { MutableRefObject, RefObject } from "react";
import { useLayoutEffect, useRef } from "react";
import {
  NULL_PROJECT_CONFIG_ID,
  useProjectState,
  useShareSession,
} from "state/definitions";
import { C } from "utils/c";
import {
  clearPendingSectionTextFocus,
  isPendingSectionTextFocus,
} from "utils/tabbingLogic";
import { fitTerminal } from "./terminalFit";
import {
  acquireTerminalSession,
  getTerminalSessionKey,
  releaseTerminalSession,
} from "./terminalSessions";
import { scrollSensitivityUpdater } from "./utils";

type UseTerminalParams = {
  sectionId: string;
  setHasScrollbar: (value: boolean) => void;
};

type TerminalFocusParams = {
  sectionId: string;
  terminal: Terminal;
  terminalRef: RefObject<HTMLDivElement | null>;
  terminalReadyRef: MutableRefObject<boolean>;
  attempt?: number;
};

type TerminalReadyListenerParams = {
  sectionId: string;
  terminal: Terminal;
  terminalRef: RefObject<HTMLDivElement | null>;
  terminalReadyRef: MutableRefObject<boolean>;
  isDeploymentMode: boolean;
  ws: WebSocket;
  isSessionReady: () => boolean;
};

export function useTerminal({ sectionId, setHasScrollbar }: UseTerminalParams) {
  const terminalRef = useRef<HTMLDivElement | null>(null);
  const terminalReadyRef = useRef(false);
  const projectConfigId = useProjectState((x) => x.projectConfig.id);
  const isDeploymentMode = useShareSession((x) => x.isDeploymentMode);
  const shareSessionId = useShareSession((x) => x.shareSessionId);

  useLayoutEffect(() => {
    terminalReadyRef.current = false;
    const container = terminalRef.current;
    if (!container) {
      return;
    }
    if (isDeploymentMode && !shareSessionId) {
      clearPendingSectionTextFocus(sectionId);
      return;
    }
    if (!projectConfigId || projectConfigId === NULL_PROJECT_CONFIG_ID) {
      clearPendingSectionTextFocus(sectionId);
      return;
    }

    const sessionKey = getTerminalSessionKey({
      projectConfigId,
      sectionId,
      shareSessionId,
    });
    const session = acquireTerminalSession({
      sessionKey,
      projectConfigId,
      sectionId,
      shareSessionId,
      isDeploymentMode,
      container,
    });
    const { terminal, ws, fitAddon } = session;

    requestAnimationFrame(() => {
      fitTerminal({
        container,
        fitAddon,
        terminal,
      });
    });

    const resizeObserver = new ResizeObserver(() => {
      fitTerminal({
        container,
        fitAddon,
        terminal,
      });
    });
    resizeObserver.observe(container);

    if (!isDeploymentMode) {
      requestPendingTerminalFocus({
        sectionId,
        terminal,
        terminalRef,
        terminalReadyRef,
      });
    }

    const removeReadyListener = registerTerminalReadyListener({
      sectionId,
      terminal,
      terminalRef,
      terminalReadyRef,
      isDeploymentMode,
      ws,
      isSessionReady: () => session.isReady,
    });
    const unsubscribeScrollSensitivity = scrollSensitivityUpdater(
      terminal,
      setHasScrollbar,
    );

    return () => {
      clearPendingSectionTextFocus(sectionId);
      removeReadyListener();
      resizeObserver.disconnect();
      unsubscribeScrollSensitivity();
      releaseTerminalSession(sessionKey);
    };
  }, [
    isDeploymentMode,
    shareSessionId,
    projectConfigId,
    sectionId,
    setHasScrollbar,
  ]);

  return terminalRef;
}

function requestPendingTerminalFocus({
  sectionId,
  terminal,
  terminalRef,
  terminalReadyRef,
}: Omit<TerminalFocusParams, "attempt">) {
  if (!isPendingSectionTextFocus(sectionId)) {
    return;
  }
  requestAnimationFrame(() => {
    focusPendingTerminalInput({
      sectionId,
      terminal,
      terminalRef,
      terminalReadyRef,
    });
  });
}

function focusPendingTerminalInput({
  sectionId,
  terminal,
  terminalRef,
  terminalReadyRef,
  attempt = 0,
}: TerminalFocusParams) {
  if (!isPendingSectionTextFocus(sectionId)) {
    return;
  }
  const focusTarget = terminalRef.current?.querySelector?.(
    ".xterm-helper-textarea, .xterm textarea",
  );
  if (focusTarget instanceof HTMLElement) {
    focusTarget.focus({ preventScroll: true });
    terminal.focus();
    const active = document.activeElement;
    if (
      terminalReadyRef.current &&
      terminalRef.current &&
      active instanceof HTMLElement &&
      terminalRef.current.contains(active)
    ) {
      clearPendingSectionTextFocus(sectionId);
      return;
    }
  }
  terminal.focus();
  if (attempt < 240) {
    requestAnimationFrame(() => {
      focusPendingTerminalInput({
        sectionId,
        terminal,
        terminalRef,
        terminalReadyRef,
        attempt: attempt + 1,
      });
    });
    return;
  }
  clearPendingSectionTextFocus(sectionId);
}

function registerTerminalReadyListener({
  sectionId,
  terminal,
  terminalRef,
  terminalReadyRef,
  isDeploymentMode,
  ws,
  isSessionReady,
}: TerminalReadyListenerParams) {
  const markReady = () => {
    terminalReadyRef.current = true;
    if (!isDeploymentMode) {
      requestPendingTerminalFocus({
        sectionId,
        terminal,
        terminalRef,
        terminalReadyRef,
      });
    }
  };

  if (isSessionReady()) {
    markReady();
    return () => {};
  }

  const onReady = (message: MessageEvent) => {
    if (message.data === C.SETTA_TERMINAL_READY) {
      markReady();
      ws.removeEventListener("message", onReady);
    }
  };
  ws.addEventListener("message", onReady);

  // Handle the (rare) race where the session becomes ready between our first
  // `isSessionReady` check and registering the listener.
  if (isSessionReady()) {
    markReady();
    ws.removeEventListener("message", onReady);
    return () => {};
  }

  return () => {
    ws.removeEventListener("message", onReady);
  };
}
