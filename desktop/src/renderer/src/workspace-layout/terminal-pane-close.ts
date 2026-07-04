import type { TerminalSessionSummary } from "@generated/backend";
import type { SettaAPI } from "@shared/types";

import { errorMessage } from "./terminal-ergonomics";
import type { SurfacePaneCloseRequest, SurfacePaneCloseResult } from "./types";

const terminalPaneCloseInFlight = new WeakSet<object>();

interface TerminalPaneCloseOptions {
  api: SettaAPI["terminal"] | null;
  applySessionSummary(session: TerminalSessionSummary): void;
  confirm: SurfacePaneCloseRequest["confirm"];
  owner: object;
  sessionId: string | null;
  sessionStatus: string;
  showExitOverlay(message: string): void;
  showStatus(message: string): void;
}

export async function requestTerminalPaneClose({
  api,
  applySessionSummary,
  confirm,
  owner,
  sessionId,
  sessionStatus,
  showExitOverlay,
  showStatus,
}: TerminalPaneCloseOptions): Promise<SurfacePaneCloseResult> {
  if (!sessionId || sessionStatus === "closed") {
    return { removePane: true };
  }
  if (terminalPaneCloseInFlight.has(owner)) {
    showStatus("Closing terminal session");
    return { removePane: false };
  }
  if (
    terminalPaneCloseRequiresConfirmation(sessionStatus) &&
    !confirm("Close running terminal session?")
  ) {
    return { removePane: false };
  }
  if (!api) {
    showTerminalCloseFailure(
      "Terminal close failed: Terminal preload API is unavailable.",
      showStatus,
      showExitOverlay,
    );
    return { removePane: false };
  }
  terminalPaneCloseInFlight.add(owner);
  showStatus("Closing terminal session");
  try {
    const response = await api.close(sessionId, "terminate");
    applySessionSummary(response.session);
    if (response.session.status !== "closed") {
      showTerminalCloseFailure(
        `Terminal close returned ${response.session.status}.`,
        showStatus,
        showExitOverlay,
      );
      return { removePane: false };
    }
    return { removePane: true };
  } catch (error) {
    showTerminalCloseFailure(
      `Terminal close failed: ${errorMessage(error)}`,
      showStatus,
      showExitOverlay,
    );
    return { removePane: false };
  } finally {
    terminalPaneCloseInFlight.delete(owner);
  }
}

function showTerminalCloseFailure(
  message: string,
  showStatus: (message: string) => void,
  showExitOverlay: (message: string) => void,
): void {
  showStatus(message);
  showExitOverlay(message);
}

function terminalPaneCloseRequiresConfirmation(status: string): boolean {
  return status === "" || status === "running" || status === "starting";
}
