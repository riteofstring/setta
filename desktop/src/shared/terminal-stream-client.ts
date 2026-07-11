import {
  backendDuplexProtocols,
  terminalStreamErrorCodeValues,
  type CreateTerminalStreamTicketResponse,
  type TerminalEvent,
  type TerminalStreamClientMessage,
  type TerminalStreamErrorCode,
  type TerminalStreamInputMessage,
  type TerminalStreamServerMessage,
} from "@generated/backend";

export interface TerminalStreamInput {
  dataBase64: string;
  sessionId: string;
}

export type TerminalStreamStatus =
  | { kind: "connecting"; attempt: number; message: string }
  | { kind: "ready"; message: string }
  | { kind: "reconnecting"; attempt: number; code: TerminalStreamErrorCode | null; message: string }
  | { kind: "backpressure"; code: "input_backpressure" | "output_backpressure"; message: string }
  | { kind: "error"; code: TerminalStreamErrorCode; message: string; retryable: boolean }
  | { kind: "stopped"; message: string };

export function decodeTerminalStreamStatus(value: unknown): TerminalStreamStatus {
  if (typeof value !== "object" || value === null) {
    throw new Error("Terminal stream status must be an object.");
  }
  const status = value as Record<string, unknown>;
  const message = requiredString(status.message, "message");
  const decoder =
    typeof status.kind === "string" ? terminalStreamStatusDecoders[status.kind] : undefined;
  if (!decoder) {
    throw new Error(`Terminal stream status kind is invalid: ${String(status.kind)}`);
  }
  return decoder(status, message);
}

const terminalStreamStatusDecoders: Record<
  string,
  (status: Record<string, unknown>, message: string) => TerminalStreamStatus
> = {
  backpressure: (status, message) => ({
    code: requiredBackpressureCode(status.code),
    kind: "backpressure",
    message,
  }),
  connecting: (status, message) => ({
    attempt: requiredInteger(status.attempt, "attempt"),
    kind: "connecting",
    message,
  }),
  error: (status, message) => ({
    code: requiredErrorCode(status.code),
    kind: "error",
    message,
    retryable: requiredBoolean(status.retryable, "retryable"),
  }),
  ready: (_status, message) => ({ kind: "ready", message }),
  reconnecting: (status, message) => ({
    attempt: requiredInteger(status.attempt, "attempt"),
    code: status.code === null ? null : requiredErrorCode(status.code),
    kind: "reconnecting",
    message,
  }),
  stopped: (_status, message) => ({ kind: "stopped", message }),
};

export interface TerminalStreamSocket {
  readonly readyState: number;
  addEventListener(type: "open", listener: () => void, options?: { once?: boolean }): void;
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  addEventListener(
    type: "close",
    listener: (event: { code: number; reason: string }) => void,
  ): void;
  addEventListener(type: "error", listener: () => void): void;
  close(code?: number, reason?: string): void;
  send(data: string): void;
}

interface TerminalStreamClientOptions {
  clientStreamId: string;
  createTicket: () => Promise<CreateTerminalStreamTicketResponse>;
  onEvent: (event: TerminalEvent) => void;
  onStatus: (status: TerminalStreamStatus) => void;
  openSocket: (ticket: string) => TerminalStreamSocket;
  reconnectDelayMs?: number;
}

interface PendingInput extends TerminalStreamInputMessage {
  byteCount: number;
}

interface SessionInputState {
  acknowledged: number;
  nextSequence: number;
  pending: PendingInput[];
  sentThrough: number;
}

const socketOpen = 1;
const defaultReconnectDelayMs = 500;

export class TerminalStreamClient {
  private attempt = 0;
  private cursor = { afterSequence: 0, streamId: "" };
  private initialization: "start" | "resume" = "start";
  private maxInputBytes = 64 * 1024;
  private maxQueuedInputBytes = 256 * 1024;
  private queuedInputBytes = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly sessions = new Map<string, SessionInputState>();
  private socket: TerminalStreamSocket | null = null;
  private stopped = true;

  constructor(private readonly options: TerminalStreamClientOptions) {}

  start(): void {
    if (!this.stopped) {
      return;
    }
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    if (this.stopped) {
      return;
    }
    this.stopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    const socket = this.socket;
    this.socket = null;
    socket?.close(1000, "terminal_stream_stopped");
    this.options.onStatus({ kind: "stopped", message: "Terminal stream stopped." });
  }

  sendInput(input: TerminalStreamInput): void {
    const byteCount = decodedBase64ByteCount(input.dataBase64);
    if (byteCount <= 0 || byteCount > this.maxInputBytes) {
      this.options.onStatus({
        code: "input_backpressure",
        kind: "backpressure",
        message: `Terminal input must contain 1-${this.maxInputBytes} bytes.`,
      });
      return;
    }
    if (this.queuedInputBytes + byteCount > this.maxQueuedInputBytes) {
      this.options.onStatus({
        code: "input_backpressure",
        kind: "backpressure",
        message: "Terminal input queue is full.",
      });
      return;
    }
    const state = this.session(input.sessionId);
    const message: PendingInput = {
      byteCount,
      dataBase64: input.dataBase64,
      inputSequence: state.nextSequence,
      kind: "terminal.stream.input",
      sessionId: input.sessionId,
    };
    state.nextSequence += 1;
    state.pending.push(message);
    this.queuedInputBytes += byteCount;
    this.flushInput();
  }

  private connect(): void {
    if (this.stopped) {
      return;
    }
    this.attempt += 1;
    this.options.onStatus({
      attempt: this.attempt,
      kind: "connecting",
      message: "Connecting terminal stream.",
    });
    void this.options
      .createTicket()
      .then((ticket) => this.open(ticket))
      .catch((error: unknown) => this.reconnect(errorMessage(error), null));
  }

  private open(ticket: CreateTerminalStreamTicketResponse): void {
    if (this.stopped) {
      return;
    }
    this.maxInputBytes = ticket.maxInputBytes;
    this.maxQueuedInputBytes = ticket.maxQueuedInputBytes;
    const socket = this.options.openSocket(ticket.ticket);
    this.socket = socket;
    socket.addEventListener("open", () => this.sendInitialization(socket), { once: true });
    socket.addEventListener("message", (event) => this.receive(socket, event.data));
    socket.addEventListener("error", () => {
      if (this.socket === socket) {
        socket.close(1011, "terminal_stream_transport_error");
      }
    });
    socket.addEventListener("close", (event) => {
      if (this.socket !== socket) {
        return;
      }
      this.socket = null;
      this.resetSentThrough();
      if (!this.stopped) {
        this.reconnect(event.reason || `Terminal stream closed (${event.code}).`, closeCode(event));
      }
    });
  }

  private sendInitialization(socket: TerminalStreamSocket): void {
    const message: TerminalStreamClientMessage =
      this.initialization === "start"
        ? {
            clientStreamId: this.options.clientStreamId,
            eventCursor: this.cursor,
            kind: "terminal.stream.start",
          }
        : {
            clientStreamId: this.options.clientStreamId,
            eventCursor: this.cursor,
            kind: "terminal.stream.resume",
            sessions: [...this.sessions.entries()].map(([sessionId, state]) => ({
              lastAcknowledgedInputSequence: state.acknowledged,
              sessionId,
            })),
          };
    socket.send(JSON.stringify(message));
  }

  private receive(socket: TerminalStreamSocket, data: unknown): void {
    if (this.socket !== socket) {
      return;
    }
    try {
      const message = backendDuplexProtocols.TerminalStream.decodeServerMessage(
        JSON.parse(socketMessageText(data)),
      );
      this.handleMessage(socket, message);
    } catch (error) {
      socket.close(1008, "malformed_frame");
      this.options.onStatus({
        code: "malformed_frame",
        kind: "error",
        message: errorMessage(error),
        retryable: false,
      });
    }
  }

  private handleMessage(socket: TerminalStreamSocket, message: TerminalStreamServerMessage): void {
    switch (message.kind) {
      case "terminal.stream.ready":
        this.initialization = "resume";
        this.attempt = 0;
        this.maxInputBytes = message.maxInputBytes;
        this.maxQueuedInputBytes = message.maxQueuedInputBytes;
        for (const session of message.sessions) {
          this.acknowledge(session.sessionId, session.acknowledgedInputSequence);
        }
        this.options.onStatus({ kind: "ready", message: "Terminal stream connected." });
        this.flushInput();
        return;
      case "terminal.stream.inputAck":
        this.acknowledge(message.sessionId, message.acknowledgedInputSequence);
        this.flushInput();
        return;
      case "terminal.stream.event":
      case "terminal.stream.replayTruncated":
        if (isNewerEvent(message.event, this.cursor)) {
          this.cursor = {
            afterSequence: message.event.sequence,
            streamId: message.event.streamId,
          };
          this.options.onEvent(message.event);
        }
        return;
      case "terminal.stream.error":
        this.handleProtocolError(socket, message);
        return;
      default:
        assertNever(message);
    }
  }

  private handleProtocolError(
    socket: TerminalStreamSocket,
    message: Extract<TerminalStreamServerMessage, { kind: "terminal.stream.error" }>,
  ): void {
    if (message.code === "input_backpressure" || message.code === "output_backpressure") {
      this.options.onStatus({
        code: message.code,
        kind: "backpressure",
        message: message.message,
      });
    } else {
      this.options.onStatus({
        code: message.code,
        kind: "error",
        message: message.message,
        retryable: message.retryable,
      });
    }
    if (message.code === "stream_identity_mismatch") {
      if (this.initialization === "start") {
        this.initialization = "resume";
      } else {
        this.resetForBackendRestart();
      }
      socket.close(1000, "terminal_stream_identity_retry");
    } else if (message.code === "event_cursor_unavailable") {
      this.cursor = { afterSequence: 0, streamId: "" };
      socket.close(1000, "terminal_stream_cursor_retry");
    }
  }

  private flushInput(): void {
    const socket = this.socket;
    if (!socket || socket.readyState !== socketOpen || this.initialization !== "resume") {
      return;
    }
    for (const state of this.sessions.values()) {
      for (const input of state.pending) {
        if (input.inputSequence <= state.sentThrough) {
          continue;
        }
        socket.send(JSON.stringify(withoutByteCount(input)));
        state.sentThrough = input.inputSequence;
      }
    }
  }

  private acknowledge(sessionId: string, sequence: number): void {
    const state = this.session(sessionId);
    if (sequence < state.acknowledged) {
      return;
    }
    state.acknowledged = sequence;
    state.nextSequence = Math.max(state.nextSequence, sequence + 1);
    const retained: PendingInput[] = [];
    for (const input of state.pending) {
      if (input.inputSequence <= sequence) {
        this.queuedInputBytes -= input.byteCount;
      } else {
        retained.push(input);
      }
    }
    state.pending = retained;
  }

  private reconnect(message: string, code: TerminalStreamErrorCode | null): void {
    if (this.stopped || this.reconnectTimer) {
      return;
    }
    this.options.onStatus({
      attempt: this.attempt,
      code,
      kind: "reconnecting",
      message,
    });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.options.reconnectDelayMs ?? defaultReconnectDelayMs);
  }

  private resetSentThrough(): void {
    for (const state of this.sessions.values()) {
      state.sentThrough = state.acknowledged;
    }
  }

  private resetForBackendRestart(): void {
    this.cursor = { afterSequence: 0, streamId: "" };
    this.initialization = "start";
    this.queuedInputBytes = 0;
    this.sessions.clear();
  }

  private session(sessionId: string): SessionInputState {
    let state = this.sessions.get(sessionId);
    if (!state) {
      state = { acknowledged: 0, nextSequence: 1, pending: [], sentThrough: 0 };
      this.sessions.set(sessionId, state);
    }
    return state;
  }
}

function decodedBase64ByteCount(value: string): number {
  if (value === "") {
    return 0;
  }
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  return Math.floor((value.length * 3) / 4) - padding;
}

function withoutByteCount(input: PendingInput): TerminalStreamInputMessage {
  return {
    dataBase64: input.dataBase64,
    inputSequence: input.inputSequence,
    kind: input.kind,
    sessionId: input.sessionId,
  };
}

function socketMessageText(data: unknown): string {
  if (typeof data === "string") {
    return data;
  }
  if (data instanceof ArrayBuffer) {
    return new TextDecoder().decode(data);
  }
  throw new Error("Terminal stream message must be text.");
}

function isNewerEvent(
  event: TerminalEvent,
  cursor: { afterSequence: number; streamId: string },
): boolean {
  return event.streamId !== cursor.streamId || event.sequence > cursor.afterSequence;
}

function closeCode(event: { reason: string }): TerminalStreamErrorCode | null {
  return event.reason === "input_backpressure" || event.reason === "output_backpressure"
    ? event.reason
    : null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function assertNever(value: never): never {
  throw new Error(`Unhandled terminal stream message: ${String(value)}`);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`Terminal stream status ${field} must be a string.`);
  }
  return value;
}

function requiredInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`Terminal stream status ${field} must be an integer.`);
  }
  return value;
}

function requiredBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`Terminal stream status ${field} must be a boolean.`);
  }
  return value;
}

function requiredErrorCode(value: unknown): TerminalStreamErrorCode {
  if (
    typeof value !== "string" ||
    !terminalStreamErrorCodeValues.includes(value as TerminalStreamErrorCode)
  ) {
    throw new Error("Terminal stream status code is invalid.");
  }
  return value as TerminalStreamErrorCode;
}

function requiredBackpressureCode(value: unknown): "input_backpressure" | "output_backpressure" {
  const code = requiredErrorCode(value);
  if (code !== "input_backpressure" && code !== "output_backpressure") {
    throw new Error("Terminal stream backpressure code is invalid.");
  }
  return code;
}
