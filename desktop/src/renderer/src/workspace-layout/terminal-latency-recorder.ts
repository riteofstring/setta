import type { TerminalEvent } from "@generated/backend";
import type { TerminalInputTrace } from "@shared/types";
import type { TerminalLatencyRendererEvent } from "@shared/recording";

const terminalClientIdStorageKey = "setta.terminal-latency.client-id.v1";
const terminalInputSequenceStoragePrefix = "setta.terminal-latency.input-sequence.v1";

export type TerminalOutputLatencyStage =
  | "terminal_output_painted"
  | "terminal_output_renderer_received"
  | "terminal_output_xterm_write";

export function createTerminalInputTrace(sessionId: string, byteCount: number): TerminalInputTrace {
  const terminal = window.setta?.terminal;
  const runId = terminal?.recordingRunId ?? "";
  const clientId = terminalClientId();
  const inputSequence = nextInputSequence(clientId, sessionId);
  const rendererReceivedAt = timestamp();
  terminal?.recordLatency({
    at: rendererReceivedAt,
    byteCount,
    clientId,
    inputSequence,
    runId,
    sessionId,
    type: "terminal_input_renderer_received",
    url: window.location?.href ?? "",
  });
  return {
    clientId,
    inputSequence,
    preloadReceivedAt: "",
    rendererReceivedAt,
    runId,
  };
}

export function recordTerminalOutputStage(
  stage: TerminalOutputLatencyStage,
  event: TerminalEvent,
): void {
  const terminal = window.setta?.terminal;
  if (!terminal || event.type !== "terminal.output") {
    return;
  }
  const record: TerminalLatencyRendererEvent = {
    at: timestamp(),
    byteCount: event.payload.byteCount,
    clientId: terminalClientId(),
    emittedAt: event.emittedAt,
    eventId: event.eventId,
    runId: terminal.recordingRunId,
    sessionId: event.sessionId,
    transportSequence: event.sequence,
    type: stage,
    url: window.location?.href ?? "",
  };
  terminal.recordLatency(record);
}

function terminalClientId(): string {
  const existing = window.sessionStorage.getItem(terminalClientIdStorageKey);
  if (existing) {
    return existing;
  }
  const created = `terminal-client-${crypto.randomUUID()}`;
  window.sessionStorage.setItem(terminalClientIdStorageKey, created);
  return created;
}

function nextInputSequence(clientId: string, sessionId: string): number {
  const key = `${terminalInputSequenceStoragePrefix}:${clientId}:${sessionId}`;
  const stored = window.sessionStorage.getItem(key);
  const current = stored === null ? 0 : Number.parseInt(stored, 10);
  if (!Number.isInteger(current) || current < 0) {
    throw new Error(`invalid terminal input sequence ${stored} for ${clientId}:${sessionId}`);
  }
  const next = current + 1;
  window.sessionStorage.setItem(key, String(next));
  return next;
}

function timestamp(): string {
  return new Date().toISOString();
}
