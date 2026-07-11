import { describe, expect, test, vi } from "vitest";

import type { TerminalEvent } from "@generated/backend";
import {
  TerminalStreamClient,
  type TerminalStreamSocket,
  type TerminalStreamStatus,
} from "./terminal-stream-client";

describe("TerminalStreamClient", () => {
  test("orders input, acknowledges it, and resumes unacknowledged input after reconnect", async () => {
    const sockets: FakeTerminalSocket[] = [];
    const statuses: TerminalStreamStatus[] = [];
    const client = new TerminalStreamClient({
      clientStreamId: "terminal_stream_test",
      createTicket: async () => ticket(),
      onEvent: () => {},
      onStatus: (status) => statuses.push(status),
      openSocket: () => {
        const socket = new FakeTerminalSocket();
        sockets.push(socket);
        return socket;
      },
      reconnectDelayMs: 0,
    });

    client.start();
    await vi.waitFor(() => expect(sockets).toHaveLength(1));
    sockets[0]!.open();
    expect(sockets[0]!.sentJSON()).toEqual([
      {
        clientStreamId: "terminal_stream_test",
        eventCursor: { afterSequence: 0, streamId: "" },
        kind: "terminal.stream.start",
      },
    ]);
    sockets[0]!.message(ready([]));

    client.sendInput({ dataBase64: "YQ==", sessionId: "session_one" });
    client.sendInput({ dataBase64: "Yg==", sessionId: "session_one" });
    expect(sockets[0]!.sentJSON().slice(1)).toEqual([
      {
        dataBase64: "YQ==",
        inputSequence: 1,
        kind: "terminal.stream.input",
        sessionId: "session_one",
      },
      {
        dataBase64: "Yg==",
        inputSequence: 2,
        kind: "terminal.stream.input",
        sessionId: "session_one",
      },
    ]);
    sockets[0]!.message({
      acknowledgedInputSequence: 1,
      acceptedBytes: 1,
      kind: "terminal.stream.inputAck",
      sessionId: "session_one",
    });
    sockets[0]!.disconnect(1013, "output_backpressure");

    await vi.waitFor(() => expect(sockets).toHaveLength(2));
    sockets[1]!.open();
    expect(sockets[1]!.sentJSON()[0]).toEqual({
      clientStreamId: "terminal_stream_test",
      eventCursor: { afterSequence: 0, streamId: "" },
      kind: "terminal.stream.resume",
      sessions: [{ lastAcknowledgedInputSequence: 1, sessionId: "session_one" }],
    });
    sockets[1]!.message(ready([{ acknowledgedInputSequence: 1, sessionId: "session_one" }]));
    expect(sockets[1]!.sentJSON()[1]).toEqual({
      dataBase64: "Yg==",
      inputSequence: 2,
      kind: "terminal.stream.input",
      sessionId: "session_one",
    });
    expect(statuses.some((status) => status.kind === "reconnecting")).toBe(true);
    client.stop();
  });

  test("deduplicates replayed events and exposes local backpressure as typed status", async () => {
    const socket = new FakeTerminalSocket();
    const events: TerminalEvent[] = [];
    const statuses: TerminalStreamStatus[] = [];
    const client = new TerminalStreamClient({
      clientStreamId: "terminal_stream_test",
      createTicket: async () => ({ ...ticket(), maxQueuedInputBytes: 1 }),
      onEvent: (event) => events.push(event),
      onStatus: (status) => statuses.push(status),
      openSocket: () => socket,
    });
    client.start();
    await vi.waitFor(() => expect(socket.listenerCount("open")).toBe(1));
    socket.open();
    socket.message({ ...ready([]), maxQueuedInputBytes: 1 });
    const event = terminalEvent(4);
    socket.message({ event, kind: "terminal.stream.event" });
    socket.message({ event, kind: "terminal.stream.event" });
    client.sendInput({ dataBase64: "YWI=", sessionId: "session_one" });

    expect(events).toEqual([event]);
    expect(statuses.at(-1)).toEqual({
      code: "input_backpressure",
      kind: "backpressure",
      message: "Terminal input queue is full.",
    });
    client.stop();
  });
});

class FakeTerminalSocket implements TerminalStreamSocket {
  readyState = 0;
  private readonly listeners = new Map<string, Array<(event: unknown) => void>>();
  private readonly sent: string[] = [];

  addEventListener(type: "open", listener: () => void, options?: { once?: boolean }): void;
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  addEventListener(
    type: "close",
    listener: (event: { code: number; reason: string }) => void,
  ): void;
  addEventListener(type: "error", listener: () => void): void;
  addEventListener(type: string, listener: (event: never) => void): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener as (event: unknown) => void);
    this.listeners.set(type, listeners);
  }

  close(code = 1000, reason = ""): void {
    this.disconnect(code, reason);
  }

  disconnect(code: number, reason: string): void {
    this.readyState = 3;
    this.emit("close", { code, reason });
  }

  listenerCount(type: string): number {
    return this.listeners.get(type)?.length ?? 0;
  }

  message(message: unknown): void {
    this.emit("message", { data: JSON.stringify(message) });
  }

  open(): void {
    this.readyState = 1;
    this.emit("open", undefined);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  sentJSON(): unknown[] {
    return this.sent.map((value) => JSON.parse(value));
  }

  private emit(type: string, event: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

function ticket() {
  return {
    clientStreamId: "terminal_stream_test",
    expiresAt: "2026-07-11T00:00:30Z",
    expiresInSeconds: 30,
    maxInputBytes: 64 * 1024,
    maxQueuedInputBytes: 256 * 1024,
    ticket: "ticket_test",
  };
}

function ready(sessions: Array<{ acknowledgedInputSequence: number; sessionId: string }>) {
  return {
    clientStreamId: "terminal_stream_test",
    eventCursor: { afterSequence: 0, streamId: "" },
    kind: "terminal.stream.ready",
    maxInputBytes: 64 * 1024,
    maxQueuedInputBytes: 256 * 1024,
    protocolVersion: 1,
    serverStreamId: "server_test",
    sessions,
  };
}

function terminalEvent(sequence: number): TerminalEvent {
  return {
    emittedAt: "2026-07-11T00:00:00Z",
    eventId: `event_${sequence}`,
    paneId: "pane_one",
    payload: {
      byteCount: 1,
      cols: 0,
      cwd: "",
      dataBase64: "YQ==",
      droppedBytes: 0,
      droppedChunks: 0,
      exitCode: 0,
      message: "",
      rows: 0,
      status: "running",
    },
    schemaVersion: 1,
    sequence,
    sessionId: "session_one",
    streamId: "stream_one",
    type: "terminal.output",
    workspaceId: "workspace_one",
  };
}
