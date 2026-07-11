import {
  backendEndpoints,
  type CreateTerminalStreamTicketResponse,
  type TerminalEvent,
} from "@generated/backend";
import {
  TerminalStreamClient,
  type TerminalStreamInput,
  type TerminalStreamSocket,
  type TerminalStreamStatus,
} from "@shared/terminal-stream-client";

const webTerminalStreamIDStoragePrefix = "setta.web.terminal-stream-id.v1";

interface WebTerminalStreamOptions {
  baseURL: string;
  createTicket: (clientStreamId: string) => Promise<CreateTerminalStreamTicketResponse>;
  deviceId: string;
  runtimeId: string;
}

export interface WebTerminalStream {
  input: (input: TerminalStreamInput) => void;
  onEvent: (listener: (event: TerminalEvent) => void) => () => void;
  onStatus: (listener: (status: TerminalStreamStatus) => void) => () => void;
  start: () => void;
  stop: () => void;
}

export function createWebTerminalStream(options: WebTerminalStreamOptions): WebTerminalStream {
  const eventListeners = new Set<(event: TerminalEvent) => void>();
  const statusListeners = new Set<(status: TerminalStreamStatus) => void>();
  const clientStreamId = storedClientStreamID(options.runtimeId, options.deviceId);
  const client = new TerminalStreamClient({
    clientStreamId,
    createTicket: () => options.createTicket(clientStreamId),
    onEvent: (event) => notify(eventListeners, event),
    onStatus: (status) => notify(statusListeners, status),
    openSocket: (ticket) => openWebTerminalSocket(options.baseURL, ticket),
  });
  return {
    input: (input) => client.sendInput(input),
    onEvent: (listener) => subscribe(eventListeners, listener),
    onStatus: (listener) => subscribe(statusListeners, listener),
    start: () => client.start(),
    stop: () => client.stop(),
  };
}

function storedClientStreamID(runtimeId: string, deviceId: string): string {
  const storageKey = `${webTerminalStreamIDStoragePrefix}:${runtimeId}:${deviceId}`;
  const stored = localStorage.getItem(storageKey);
  if (stored) {
    return stored;
  }
  const created = `terminal_stream_web_${crypto.randomUUID()}`;
  localStorage.setItem(storageKey, created);
  return created;
}

function openWebTerminalSocket(baseURL: string, ticket: string): TerminalStreamSocket {
  const url = new URL(backendEndpoints.TerminalStream.path, baseURL);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("ticket", ticket);
  return new WebSocket(url) as TerminalStreamSocket;
}

function subscribe<T>(
  listeners: Set<(value: T) => void>,
  listener: (value: T) => void,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify<T>(listeners: Set<(value: T) => void>, value: T): void {
  for (const listener of listeners) {
    listener(value);
  }
}
