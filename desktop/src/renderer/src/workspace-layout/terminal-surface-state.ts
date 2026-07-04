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
} as const;

export interface PendingTerminalOutput {
  byteCount: number;
  dataBase64: string;
}

export interface PendingPaste {
  byteCount: number;
  text: string;
}

export type TerminalStatusEvent = TerminalEvent & {
  type: Exclude<TerminalEvent["type"], "terminal.output">;
};
