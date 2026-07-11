import { createHash } from "node:crypto";

import { backendEndpoints, type BackendClient, type TerminalEvent } from "@generated/backend";
import {
  TerminalStreamClient,
  type TerminalStreamInput,
  type TerminalStreamSocket,
  type TerminalStreamStatus,
} from "@shared/terminal-stream-client";

interface MainTerminalStreamOptions {
  backendClient: BackendClient;
  baseURL: string;
  deviceToken: string;
  runtimeID: string;
  sendEvent: (event: TerminalEvent) => void;
  sendStatus: (status: TerminalStreamStatus) => void;
}

export interface MainTerminalStream {
  sendInput: (input: TerminalStreamInput) => void;
  start: () => void;
  stop: () => void;
}

export function createMainTerminalStream(options: MainTerminalStreamOptions): MainTerminalStream {
  const clientStreamId = stableDesktopTerminalStreamID(options.runtimeID, options.deviceToken);
  const client = new TerminalStreamClient({
    clientStreamId,
    createTicket: () => options.backendClient.createTerminalStreamTicket({ clientStreamId }),
    onEvent: options.sendEvent,
    onStatus: options.sendStatus,
    openSocket: (ticket) => openTerminalSocket(options.baseURL, ticket),
  });
  return {
    sendInput: (input) => client.sendInput(input),
    start: () => client.start(),
    stop: () => client.stop(),
  };
}

function stableDesktopTerminalStreamID(runtimeID: string, deviceToken: string): string {
  const digest = createHash("sha256")
    .update(runtimeID)
    .update("\0")
    .update(deviceToken)
    .digest("hex");
  return `terminal_stream_desktop_${digest.slice(0, 32)}`;
}

function openTerminalSocket(baseURL: string, ticket: string): TerminalStreamSocket {
  const url = new URL(backendEndpoints.TerminalStream.path, baseURL);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("ticket", ticket);
  return new WebSocket(url) as TerminalStreamSocket;
}
