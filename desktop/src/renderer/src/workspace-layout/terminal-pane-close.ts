import type { CloseTerminalResponse, TerminalSessionSummary } from "@generated/backend";
import type { SettaAPI } from "@shared/types";

import { errorMessage } from "./terminal-ergonomics";
import type { SurfacePaneCloseRequest, SurfacePaneCloseResult } from "./types";

const terminalPaneCloseInFlight = new WeakSet<object>();

interface TerminalPaneCloseOptions {
  api: SettaAPI["terminal"] | null;
  applySessionSummary(session: TerminalSessionSummary): void;
  confirm: SurfacePaneCloseRequest["confirm"];
  getSessionId(): string | null;
  getSessionStatus(): string;
  owner: object;
  showExitOverlay(message: string): void;
  showStatus(message: string): void;
  waitForPendingSessionStart(): Promise<void> | null;
}

interface TerminalPaneCloseState {
  pendingStart: Promise<void> | null;
  sessionId: string | null;
  sessionStatus: string;
}

export async function requestTerminalPaneClose(
  options: TerminalPaneCloseOptions,
): Promise<SurfacePaneCloseResult> {
  const state = terminalPaneCloseState(options);
  const immediateResult = terminalPaneImmediateCloseResult(state);
  if (immediateResult) {
    return immediateResult;
  }
  if (!beginTerminalPaneClose(options)) {
    return { removePane: false };
  }
  const api = terminalCloseAPI(options);
  if (!api) {
    return { removePane: false };
  }
  terminalPaneCloseInFlight.add(options.owner);
  options.showStatus("Closing terminal session");
  try {
    const sessionId = await terminalPaneCloseSessionId(options, state);
    if (!sessionId) {
      return { removePane: true };
    }
    return await closeTerminalSession(api, options, sessionId);
  } catch (error) {
    showTerminalCloseFailure(
      `Terminal close failed: ${errorMessage(error)}`,
      options.showStatus,
      options.showExitOverlay,
    );
    return { removePane: false };
  } finally {
    terminalPaneCloseInFlight.delete(options.owner);
  }
}

function terminalPaneCloseState(options: TerminalPaneCloseOptions): TerminalPaneCloseState {
  const sessionId = options.getSessionId();
  return {
    pendingStart: sessionId ? null : options.waitForPendingSessionStart(),
    sessionId,
    sessionStatus: options.getSessionStatus(),
  };
}

function terminalPaneImmediateCloseResult(
  state: TerminalPaneCloseState,
): SurfacePaneCloseResult | null {
  if (state.sessionId && state.sessionStatus === "closed") {
    return { removePane: true };
  }
  if (!state.sessionId && !state.pendingStart) {
    return { removePane: true };
  }
  return null;
}

function beginTerminalPaneClose({ owner, showStatus }: TerminalPaneCloseOptions): boolean {
  if (terminalPaneCloseInFlight.has(owner)) {
    showStatus("Closing terminal session");
    return false;
  }
  return true;
}

function terminalCloseAPI({
  api,
  showExitOverlay,
  showStatus,
}: TerminalPaneCloseOptions): SettaAPI["terminal"] | null {
  if (api) {
    return api;
  }
  showTerminalCloseFailure(
    "Terminal close failed: Terminal preload API is unavailable.",
    showStatus,
    showExitOverlay,
  );
  return null;
}

async function terminalPaneCloseSessionId(
  { getSessionId, getSessionStatus }: TerminalPaneCloseOptions,
  state: TerminalPaneCloseState,
): Promise<string | null> {
  if (!state.pendingStart) {
    return state.sessionId;
  }
  await state.pendingStart;
  const sessionId = getSessionId();
  if (!sessionId || getSessionStatus() === "closed") {
    return null;
  }
  return sessionId;
}

async function closeTerminalSession(
  api: SettaAPI["terminal"],
  options: TerminalPaneCloseOptions,
  sessionId: string,
): Promise<SurfacePaneCloseResult> {
  const response = await api.close({ confirmed: false, sessionId });
  return handleCloseResponse(api, options, sessionId, response);
}

async function handleCloseResponse(
  api: SettaAPI["terminal"],
  {
    applySessionSummary,
    confirm,
    showExitOverlay,
    showStatus,
  }: Pick<
    TerminalPaneCloseOptions,
    "applySessionSummary" | "confirm" | "showExitOverlay" | "showStatus"
  >,
  sessionId: string,
  response: CloseTerminalResponse,
): Promise<SurfacePaneCloseResult> {
  if (response.session !== null) {
    applySessionSummary(response.session);
  }
  switch (response.kind) {
    case "closed":
      if (response.session === null || response.session.status === "closed") {
        return { removePane: true };
      }
      showTerminalCloseFailure(
        `Terminal close returned ${response.session.status}.`,
        showStatus,
        showExitOverlay,
      );
      return { removePane: false };
    case "confirmation_required":
      if (!confirm(response.assessment.summary)) {
        return { removePane: false };
      }
      return handleCloseResponse(
        api,
        { applySessionSummary, confirm, showExitOverlay, showStatus },
        sessionId,
        await api.close({ confirmed: true, sessionId }),
      );
    default:
      return assertNever(response.kind);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled terminal close result: ${JSON.stringify(value)}`);
}

function showTerminalCloseFailure(
  message: string,
  showStatus: (message: string) => void,
  showExitOverlay: (message: string) => void,
): void {
  showStatus(message);
  showExitOverlay(message);
}
