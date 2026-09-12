import { describe, expect, it, vi } from "vitest";

import { makeProject } from "../testProject";
import {
  CONTENT_PATH,
  PROJECT_PATH,
  PROJECT_EVENTS_PATH,
  RUNTIME_PATH,
  RUNTIME_RELOAD_PATH,
  RUNTIME_SOURCE_PATH,
  RealtimeClientError,
  applyProject,
  applyRuntimeSource,
  connectProjectEvents,
  connectRuntime,
  fetchProject,
  fetchRuntimeSource,
  reloadRuntime,
  type ProjectEventSource,
  type RuntimeSocket,
  uploadContent,
} from "./client";

describe("realtime client boundary", () => {
  it("rejects an outgoing HTTP command that violates the generated apply schema", async () => {
    const fetchImplementation = vi.fn() as unknown as typeof fetch;

    await expect(
      applyProject(
        makeProject(),
        [{ name: "", op: "setName" }],
        fetchImplementation,
      ),
    ).rejects.toMatchObject({ kind: "invalid-request" });
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

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

  it("requests runtime reload through the existing HTTP command boundary", async () => {
    const fetchImplementation = vi.fn(
      async () => new Response(null, { status: 200 }),
    ) as unknown as typeof fetch;

    await expect(reloadRuntime(fetchImplementation)).resolves.toBeUndefined();
    expect(fetchImplementation).toHaveBeenCalledWith(RUNTIME_RELOAD_PATH, {
      headers: { Accept: "application/json" },
      method: "POST",
    });
  });

  it("loads and applies the declared entrypoint source", async () => {
    const source = {
      entrypoint: "main.py",
      projectId: "project-main",
      source: "value = 1\n",
      version: "a".repeat(64),
    };
    const fetchImplementation = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(source), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            activation: { error: null, state: "activated" },
            source: {
              ...source,
              source: "value = 2\n",
              version: "b".repeat(64),
            },
          }),
          { status: 200 },
        ),
      ) as unknown as typeof fetch;

    await expect(fetchRuntimeSource(fetchImplementation)).resolves.toEqual(
      source,
    );
    expect(fetchImplementation).toHaveBeenNthCalledWith(
      1,
      RUNTIME_SOURCE_PATH,
      {
        headers: { Accept: "application/json" },
        method: "GET",
      },
    );
    await expect(
      applyRuntimeSource(
        {
          entrypoint: source.entrypoint,
          expectedVersion: source.version,
          projectId: source.projectId,
          source: "value = 2\n",
        },
        fetchImplementation,
      ),
    ).resolves.toMatchObject({ activation: { state: "activated" } });
    expect(fetchImplementation).toHaveBeenNthCalledWith(
      2,
      RUNTIME_SOURCE_PATH,
      {
        body: JSON.stringify({
          entrypoint: "main.py",
          expectedVersion: "a".repeat(64),
          projectId: "project-main",
          source: "value = 2\n",
        }),
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        method: "PUT",
      },
    );
  });

  it("rejects invalid source commands and mismatched source results", async () => {
    const fetchImplementation = vi.fn() as unknown as typeof fetch;
    await expect(
      applyRuntimeSource(
        {
          entrypoint: "main.py",
          expectedVersion: "not-a-version",
          projectId: "project-main",
          source: "value = 2\n",
        },
        fetchImplementation,
      ),
    ).rejects.toMatchObject({ kind: "invalid-request" });
    expect(fetchImplementation).not.toHaveBeenCalled();

    const mismatchedFetch = vi.fn(async () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            activation: { error: null, state: "activated" },
            source: {
              entrypoint: "main.py",
              projectId: "project-main",
              source: "different source\n",
              version: "b".repeat(64),
            },
          }),
          { status: 200 },
        ),
      ),
    ) as unknown as typeof fetch;
    await expect(
      applyRuntimeSource(
        {
          entrypoint: "main.py",
          expectedVersion: "a".repeat(64),
          projectId: "project-main",
          source: "value = 2\n",
        },
        mismatchedFetch,
      ),
    ).rejects.toMatchObject({ kind: "invalid-response" });
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
        handlers: ["run"],
        invocations: {},
        publishedByBinding: {},
        retainedByBinding: {},
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
      cause: "interaction",
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
