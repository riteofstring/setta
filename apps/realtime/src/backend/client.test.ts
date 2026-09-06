import { describe, expect, it, vi } from "vitest";

import {
  CONTENT_PATH,
  PROJECT_PATH,
  PROJECT_EVENTS_PATH,
  RUNTIME_PATH,
  RealtimeClientError,
  connectProjectEvents,
  connectRuntime,
  fetchProject,
  type ProjectEventSource,
  type RuntimeSocket,
  uploadContent,
} from "./client";

describe("realtime client boundary", () => {
  it("rejects a successful HTTP response that violates the generated project schema", async () => {
    const fetchImplementation = vi.fn(
      async () =>
        new Response(JSON.stringify({ id: "partial-project" }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        }),
    ) as unknown as typeof fetch;

    await expect(fetchProject(fetchImplementation)).rejects.toMatchObject({
      kind: "invalid-response",
    } satisfies Partial<RealtimeClientError>);
    expect(fetchImplementation).toHaveBeenCalledWith(
      PROJECT_PATH,
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("scopes raw content uploads with a client-generated staging invocation", async () => {
    const reference = {
      byteLength: 3,
      id: "content-main",
      invocationId: "drawing-stage-1",
      mediaType: "image/png",
      sha256: "a".repeat(64),
    };
    const fetchImplementation = vi.fn(
      async () =>
        new Response(JSON.stringify(reference), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        }),
    ) as unknown as typeof fetch;
    const blob = new Blob(["png"], { type: "image/png" });

    await expect(
      uploadContent(blob, "drawing-stage-1", fetchImplementation),
    ).resolves.toEqual(reference);
    expect(fetchImplementation).toHaveBeenCalledWith(CONTENT_PATH, {
      body: blob,
      headers: {
        Accept: "application/json",
        "Content-Type": "image/png",
        "X-Setta-Invocation-ID": "drawing-stage-1",
      },
      method: "POST",
    });
  });

  it("closes an authored snapshot stream when generated validation fails", () => {
    const source: ProjectEventSource = {
      close: vi.fn(),
      onerror: null,
      onmessage: null,
    };
    const onInvalid = vi.fn();
    const disconnect = connectProjectEvents(
      { onInvalid, onProject: vi.fn() },
      (path) => {
        expect(path).toBe(PROJECT_EVENTS_PATH);
        return source;
      },
    );

    source.onmessage?.call(
      source as unknown as EventSource,
      new MessageEvent("message", { data: JSON.stringify({ revision: 8 }) }),
    );
    expect(source.close).toHaveBeenCalledOnce();
    expect(onInvalid).toHaveBeenCalledOnce();
    disconnect();
  });

  it("opens one secure runtime socket, validates envelopes, and sends exact events", () => {
    const send = vi.fn();
    const close = vi.fn();
    const socket: RuntimeSocket = {
      close,
      onclose: null,
      onerror: null,
      onmessage: null,
      onopen: null,
      readyState: WebSocket.OPEN,
      send,
    };
    let socketUrl = "";
    const onEnvelope = vi.fn();
    const transport = connectRuntime(
      {
        onClose: vi.fn(),
        onEnvelope,
        onInvalid: vi.fn(),
        onOpen: vi.fn(),
      },
      (url) => {
        socketUrl = url;
        return socket;
      },
      { href: "https://localhost:8443/realtime" } as Location,
    );
    const envelope = {
      snapshot: {
        invocations: {},
        sessionId: "session-main",
        values: {},
        workerState: "ready",
      },
      type: "snapshot",
    };
    socket.onmessage?.call(
      socket as unknown as WebSocket,
      new MessageEvent("message", { data: JSON.stringify(envelope) }),
    );
    const event = {
      event: "press",
      payload: null,
      sectionId: "button-main",
      sessionId: "session-main",
      type: "event",
    } as const;

    expect(socketUrl).toBe(`wss://localhost:8443${RUNTIME_PATH}`);
    expect(onEnvelope).toHaveBeenCalledWith(envelope);
    expect(transport.send(event)).toBe(true);
    expect(send).toHaveBeenCalledWith(JSON.stringify(event));
    transport.close();
    expect(close).toHaveBeenCalledOnce();
  });

  it("rejects a content reference outside the staged invocation", async () => {
    const fetchImplementation = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            byteLength: 3,
            id: "content-main",
            invocationId: "another-stage",
            mediaType: "image/png",
            sha256: "b".repeat(64),
          }),
          { status: 200 },
        ),
    ) as unknown as typeof fetch;

    await expect(
      uploadContent(
        new Blob(["png"], { type: "image/png" }),
        "drawing-stage-1",
        fetchImplementation,
      ),
    ).rejects.toMatchObject({ kind: "invalid-response" });
  });
});
