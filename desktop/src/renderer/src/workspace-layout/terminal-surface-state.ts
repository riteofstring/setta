import type { TerminalEvent } from "@generated/backend";

export const terminalSurfaceLimits = {
  defaultCols: 80,
  defaultRows: 24,
  inputChunkBytes: 64 * 1024,
  largePasteWarningBytes: 16 * 1024,
  maxFitReadinessRetries: 4,
  maxPasteBytes: 1024 * 1024,
  maxPendingOutputChunks: 640,
  resizeDebounceMs: 80,
  sessionStartFitWaitMs: 250,
} as const;

export type TerminalStatusEvent = TerminalEvent & {
  type: Exclude<TerminalEvent["type"], "terminal.output">;
};

export interface TerminalHostState {
  dirtyRows: number;
  focused: boolean;
  frozen: boolean;
  lostSession: boolean;
  pendingOutputChunks: number;
  profileId: string;
  renderedRows: number;
  scrollbackRows: number;
  sessionId: string | null;
  sessionStatus: string;
  visible: boolean;
}

export function syncTerminalHostState(host: HTMLElement | null, state: TerminalHostState): void {
  if (!host) {
    return;
  }
  host.dataset.surfaceFocused = String(state.focused);
  host.dataset.surfaceFrozen = String(state.frozen);
  host.dataset.surfaceVisible = String(state.visible);
  host.dataset.terminalDirtyRows = String(state.dirtyRows);
  host.dataset.terminalLost = String(state.lostSession);
  host.dataset.terminalPendingChunks = String(state.pendingOutputChunks);
  host.dataset.terminalProfileId = state.profileId;
  host.dataset.terminalSessionId = state.sessionId ?? "";
  host.dataset.terminalStatus = state.sessionStatus;
  host.dataset.terminalScrollbackRows = String(state.scrollbackRows);
  host.dataset.terminalVirtualRows = String(state.renderedRows);
  host.style.visibility = state.visible ? "visible" : "hidden";
}
