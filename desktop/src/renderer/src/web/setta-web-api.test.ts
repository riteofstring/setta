import { describe, expect, test, vi } from "vitest";

import { backendProtocolVersion } from "@generated/backend";
import type { BackendFetch } from "@shared/backend-runtime";
import { authenticatedWebFetch, createWebSettaAPI } from "./setta-web-api";

describe("web SettaAPI request auth", () => {
  test("injects bearer authorization while preserving existing headers", async () => {
    let capturedInit: RequestInit | undefined;
    const fetchImpl: BackendFetch = async (_input, init = {}) => {
      capturedInit = init;
      return new Response("{}", { status: 200 });
    };
    const wrapped = authenticatedWebFetch(
      fetchImpl,
      () => "token_web",
      () => {},
    );

    await wrapped(new URL("https://runtime.example/workspace-session"), {
      headers: { "X-Test": "yes" },
      method: "GET",
    });

    expect(capturedInit?.method).toBe("GET");
    const headers = new Headers(capturedInit?.headers);
    expect(headers.get("Authorization")).toBe("Bearer token_web");
    expect(headers.get("X-Test")).toBe("yes");
  });

  test("reports revoked credentials on unauthorized responses", async () => {
    const onUnauthorized = vi.fn();
    const fetchImpl: BackendFetch = async () => new Response("{}", { status: 401 });
    const wrapped = authenticatedWebFetch(fetchImpl, () => "token_web", onUnauthorized);

    await wrapped(new URL("https://runtime.example/workspace-session"), { method: "GET" });

    expect(onUnauthorized).toHaveBeenCalledOnce();
  });
});

describe("web SettaAPI unpaired runtime state", () => {
  test("reports disconnected without opening streams or throwing during boot subscriptions", async () => {
    withWebGlobals();
    const calls: string[] = [];
    const api = createWebSettaAPI({
      fetchImpl: async (input) => {
        calls.push(input.pathname);
        if (input.pathname === "/runtime/info") {
          return jsonResponse(runtimeInfo());
        }
        throw new Error(`unexpected request while unpaired: ${input.pathname}`);
      },
    });

    const unsubscribe = api.chat.onEvent(() => {});
    const snapshot = await api.runtimes.current();

    expect(snapshot.connection.status).toBe("disconnected");
    expect(snapshot.connection.message).toBe("Pair this browser with the runtime.");
    expect(calls).toEqual(["/runtime/info"]);
    expect(() => unsubscribe()).not.toThrow();
    expect(() => api.workspace.session()).toThrow(
      "Pair this browser with the runtime before using Setta.",
    );
  });

  test("starts inert stream subscriptions after pairing completes", async () => {
    withWebGlobals();
    const calls: Array<{ authorization: string | null; path: string }> = [];
    const api = createWebSettaAPI({
      fetchImpl: async (input, init = {}) => {
        const headers = new Headers(init.headers);
        calls.push({ authorization: headers.get("Authorization"), path: input.pathname });
        switch (input.pathname) {
          case "/runtime/info":
            return jsonResponse(runtimeInfo());
          case "/pairing/complete":
            return jsonResponse({
              deviceId: "device_web",
              deviceToken: "token_web",
              protocolVersion: backendProtocolVersion,
              runtimeId: "runtime_web",
            });
          case "/devices/list":
            return jsonResponse({ devices: [] });
          case "/events":
            return new Response("", { status: 200 });
          default:
            throw new Error(`unexpected request: ${input.pathname}`);
        }
      },
    });

    const unsubscribe = api.chat.onEvent(() => {});
    expect(calls.map((call) => call.path)).toEqual([]);

    await api.runtimes.addByPairingUrl("setta://pair?rt=runtime_web&tok=token_pair");
    await waitFor(() => calls.some((call) => call.path === "/events"));

    const eventStreamCall = calls.find((call) => call.path === "/events");
    expect(eventStreamCall?.authorization).toBe("Bearer token_web");
    unsubscribe();
  });

  test("accepts phone pairing URLs with token in the fragment", async () => {
    withWebGlobals("https://runtime.tailnet.ts.net");
    const calls: Array<{ body: unknown; path: string }> = [];
    const api = createWebSettaAPI({
      fetchImpl: async (input, init = {}) => {
        calls.push({
          body: init.body ? JSON.parse(String(init.body)) : null,
          path: input.pathname,
        });
        switch (input.pathname) {
          case "/runtime/info":
            return jsonResponse(runtimeInfo());
          case "/pairing/complete":
            return jsonResponse({
              deviceId: "device_web",
              deviceToken: "token_web",
              protocolVersion: backendProtocolVersion,
              runtimeId: "runtime_web",
            });
          case "/devices/list":
            return jsonResponse({ devices: [] });
          default:
            throw new Error(`unexpected request: ${input.pathname}`);
        }
      },
    });

    const snapshot = await api.runtimes.addByPairingUrl(
      "https://runtime.tailnet.ts.net/#pair=token_pair",
    );

    expect(snapshot.connection.status).toBe("connected");
    expect(calls).toContainEqual({
      body: {
        clientDisplayName: "Setta Web",
        pairingToken: "token_pair",
      },
      path: "/pairing/complete",
    });
  });

  test("creates device pairing links through the authenticated same-origin client", async () => {
    withWebGlobals("https://runtime.tailnet.ts.net");
    const createRequests: unknown[] = [];
    const api = createWebSettaAPI({
      fetchImpl: async (input, init = {}) => {
        switch (input.pathname) {
          case "/runtime/info":
            return jsonResponse(runtimeInfo());
          case "/pairing/complete":
            return jsonResponse({
              deviceId: "device_web",
              deviceToken: "token_web",
              protocolVersion: backendProtocolVersion,
              runtimeId: "runtime_web",
            });
          case "/devices/list":
            return jsonResponse({ devices: [] });
          case "/pairing/create-device":
            createRequests.push(JSON.parse(String(init.body)));
            return jsonResponse({
              expiresAt: "2026-07-07T10:10:00Z",
              pairingUrl: "https://runtime.tailnet.ts.net/#pair=token_phone",
            });
          default:
            throw new Error(`unexpected request: ${input.pathname}`);
        }
      },
    });

    await api.runtimes.addByPairingUrl("setta://pair?rt=runtime_web&tok=token_pair");
    const pairing = await api.runtimes.createDevicePairing();

    expect(pairing.pairingUrl).toBe("https://runtime.tailnet.ts.net/#pair=token_phone");
    expect(createRequests).toEqual([{ runtimeBaseUrl: "https://runtime.tailnet.ts.net/" }]);
  });

  test("uses the authenticated duplex terminal stream for browser input and events", async () => {
    withWebGlobals("https://runtime.tailnet.ts.net");
    const sockets: WebSocketTestDouble[] = [];
    vi.stubGlobal(
      "WebSocket",
      class extends WebSocketTestDouble {
        constructor(url: URL) {
          super(url);
          sockets.push(this);
        }
      },
    );
    const ticketRequests: Array<{ authorization: string | null; body: unknown }> = [];
    const api = createWebSettaAPI({
      fetchImpl: async (input, init = {}) => {
        switch (input.pathname) {
          case "/runtime/info":
            return jsonResponse(runtimeInfo());
          case "/pairing/complete":
            return jsonResponse({
              deviceId: "device_web",
              deviceToken: "token_web",
              protocolVersion: backendProtocolVersion,
              runtimeId: "runtime_web",
            });
          case "/devices/list":
            return jsonResponse({ devices: [] });
          case "/terminals/stream/ticket":
            ticketRequests.push({
              authorization: new Headers(init.headers).get("Authorization"),
              body: JSON.parse(String(init.body)),
            });
            return jsonResponse({
              clientStreamId: JSON.parse(String(init.body)).clientStreamId,
              expiresAt: "2026-07-11T00:00:30Z",
              expiresInSeconds: 30,
              maxInputBytes: 65536,
              maxQueuedInputBytes: 262144,
              ticket: "ticket_web",
            });
          default:
            throw new Error(`unexpected request: ${input.pathname}`);
        }
      },
    });
    await api.runtimes.addByPairingUrl("setta://pair?rt=runtime_web&tok=token_pair");
    const events: unknown[] = [];
    const unsubscribe = api.terminal.onEvent((event) => events.push(event));
    await waitFor(() => sockets.length === 1);
    const socket = sockets[0]!;
    socket.open();
    const start = socket.sentJSON()[0] as { clientStreamId: string };
    socket.message({
      clientStreamId: start.clientStreamId,
      eventCursor: { afterSequence: 0, streamId: "" },
      kind: "terminal.stream.ready",
      maxInputBytes: 65536,
      maxQueuedInputBytes: 262144,
      protocolVersion: 1,
      serverStreamId: "server_web",
      sessions: [],
    });
    api.terminal.input({
      dataBase64: "YQ==",
      sessionId: "session_web",
      trace: terminalInputTrace(),
    });
    const event = terminalEvent();
    socket.message({ event, kind: "terminal.stream.event" });

    expect(ticketRequests[0]?.authorization).toBe("Bearer token_web");
    expect(socket.url.toString()).toContain("/terminals/stream?ticket=ticket_web");
    expect(socket.sentJSON()[1]).toEqual({
      dataBase64: "YQ==",
      inputSequence: 1,
      kind: "terminal.stream.input",
      sessionId: "session_web",
    });
    expect(events).toEqual([event]);
    unsubscribe();
  });
});

function withWebGlobals(origin = "http://127.0.0.1:7345") {
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      removeItem: (key: string) => {
        storage.delete(key);
      },
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
    },
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: { origin },
      open: vi.fn(),
      prompt: vi.fn(),
      setTimeout,
    },
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      userAgent: "Mozilla/5.0 Chrome",
    },
  });
}

function runtimeInfo() {
  return {
    backendName: "setta-backend",
    backendVersion: "test",
    displayName: "Web runtime",
    featureSet: {
      features: ["device_pairing_url", "runtime_web_app", "web_push"],
      version: 1,
    },
    infrastructureProvider: {
      displayName: "Unknown provider",
      iconUrl: "",
      id: "unknown",
    },
    protocolVersion: backendProtocolVersion,
    runtimeId: "runtime_web",
    vapidPublicKey: "vapid_public",
  };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

async function waitFor(assertion: () => boolean): Promise<void> {
  const deadline = Date.now() + 1000;
  while (Date.now() < deadline) {
    if (assertion()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("timed out waiting for condition");
}

class WebSocketTestDouble {
  readyState = 0;
  private readonly listeners = new Map<string, Array<(event: unknown) => void>>();
  private readonly sent: string[] = [];

  constructor(readonly url: URL) {}

  addEventListener(type: string, listener: (event: never) => void): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener as (event: unknown) => void);
    this.listeners.set(type, listeners);
  }

  close(): void {
    this.readyState = 3;
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

function terminalInputTrace() {
  return {
    clientId: "client_web",
    inputSequence: 1,
    preloadReceivedAt: "",
    rendererReceivedAt: "2026-07-11T00:00:00Z",
    runId: "run_web",
  };
}

function terminalEvent() {
  return {
    emittedAt: "2026-07-11T00:00:00Z",
    eventId: "stream_web:1",
    paneId: "pane_web",
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
      status: "running" as const,
    },
    schemaVersion: 1,
    sequence: 1,
    sessionId: "session_web",
    streamId: "stream_web",
    type: "terminal.output" as const,
    workspaceId: "workspace_web",
  };
}
