import { afterEach, describe, expect, it, vi } from "vitest";
import { GoWebsocketRouteHelpers } from "utils/generatedRoutes";
import {
  buildListenerEndpointWebsocketUrl,
  callListenerEndpointOverWebsocket,
} from "./listenerEndpointClient";

class TestWebSocket extends EventTarget {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  static instances: TestWebSocket[] = [];

  readonly url: string;
  readyState = TestWebSocket.CONNECTING;
  sentMessages: string[] = [];

  constructor(url: string | URL) {
    super();
    this.url = String(url);
    TestWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sentMessages.push(data);
  }

  close(code?: number, reason?: string): void {
    this.readyState = TestWebSocket.CLOSED;
    this.dispatchEvent(
      new CloseEvent("close", {
        code: code ?? 1000,
        reason: reason ?? "",
      }),
    );
  }

  open(): void {
    this.readyState = TestWebSocket.OPEN;
    this.dispatchEvent(new Event("open"));
  }

  receiveJson(payload: unknown): void {
    this.dispatchEvent(
      new MessageEvent("message", {
        data: JSON.stringify(payload),
      }),
    );
  }

  fail(): void {
    this.dispatchEvent(new Event("error"));
  }

  static reset(): void {
    TestWebSocket.instances = [];
  }
}

describe("listenerEndpointClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    TestWebSocket.reset();
  });

  it("builds the canonical Go listener websocket URL for IDE and deployment modes", () => {
    const idePath = GoWebsocketRouteHelpers.listenerById("listener-a");
    const ideUrl = new URL(
      buildListenerEndpointWebsocketUrl({
        listenerId: "listener-a",
        projectConfigId: "project-a",
        shareSessionId: null,
      }),
    );
    expect(ideUrl.pathname).toBe(idePath);
    expect(ideUrl.searchParams.get("projectId")).toBe("project-a");
    expect(ideUrl.searchParams.get("shareSessionId")).toBeNull();

    const deploymentPath = GoWebsocketRouteHelpers.listenerById("listener-b");
    const deploymentUrl = new URL(
      buildListenerEndpointWebsocketUrl({
        listenerId: "listener-b",
        projectConfigId: "project-b",
        shareSessionId: "share-b",
      }),
    );
    expect(deploymentUrl.pathname).toBe(deploymentPath);
    expect(deploymentUrl.searchParams.get("projectId")).toBe("project-b");
    expect(deploymentUrl.searchParams.get("shareSessionId")).toBe("share-b");
  });

  it("registers the listener websocket and resolves the router endpoint result", async () => {
    vi.stubGlobal("WebSocket", TestWebSocket as unknown as typeof WebSocket);
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(
      "listener-call-1",
    );

    const resultPromise = callListenerEndpointOverWebsocket({
      listenerId: "listener-1",
      projectConfigId: "project-1",
      endpointName: "fixture_listener_endpoint",
      payload: {
        sectionId: "section-1",
        payload: "hello",
      },
      shareSessionId: "share-1",
    });

    const socket = TestWebSocket.instances[0];
    if (!socket) {
      throw new Error("Expected listener websocket to be created.");
    }

    socket.open();
    expect(socket.sentMessages).toHaveLength(1);
    expect(JSON.parse(socket.sentMessages[0] ?? "")).toEqual({
      messageType: "ListenerRegister",
      content: {
        callbacks: {},
      },
    });

    socket.receiveJson({
      messageType: "ListenerRegisterAck",
      content: {
        projectId: "project-1",
        shareSessionId: "share-1",
        callbacks: {},
      },
    });

    expect(socket.sentMessages).toHaveLength(2);
    expect(JSON.parse(socket.sentMessages[1] ?? "")).toEqual({
      messageType: "ListenerRouterEndpointCall",
      content: {
        projectConfigId: "project-1",
        callId: "listener-call-1",
        endpointName: "fixture_listener_endpoint",
        payload: {
          sectionId: "section-1",
          payload: "hello",
        },
      },
    });

    socket.receiveJson({
      messageType: "ListenerRouterEndpointResult",
      content: {
        projectConfigId: "project-1",
        callId: "listener-call-1",
        ok: true,
        result: {
          ok: true,
          sectionId: "section-1",
        },
      },
    });

    await expect(resultPromise).resolves.toEqual({
      ok: true,
      sectionId: "section-1",
    });
  });

  it("surfaces backend listener endpoint errors and early websocket failures", async () => {
    vi.stubGlobal("WebSocket", TestWebSocket as unknown as typeof WebSocket);
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(
      "listener-call-2",
    );

    const failingResultPromise = callListenerEndpointOverWebsocket({
      listenerId: "listener-2",
      projectConfigId: "project-2",
      endpointName: "fixture_listener_endpoint",
      payload: {},
      shareSessionId: null,
    });

    const firstSocket = TestWebSocket.instances[0];
    if (!firstSocket) {
      throw new Error("Expected failing listener websocket to be created.");
    }
    firstSocket.open();
    firstSocket.receiveJson({
      messageType: "ListenerRegisterAck",
      content: {
        projectId: "project-2",
        callbacks: {},
      },
    });
    firstSocket.receiveJson({
      messageType: "ListenerRouterEndpointResult",
      content: {
        projectConfigId: "project-2",
        callId: "listener-call-2",
        ok: false,
        error: "listener_call_failed",
        details: {
          message: "boom",
        },
      },
    });

    await expect(failingResultPromise).rejects.toThrow(
      "Listener endpoint fixture_listener_endpoint failed: listener_call_failed (boom)",
    );

    const brokenSocketPromise = callListenerEndpointOverWebsocket({
      listenerId: "listener-3",
      projectConfigId: "project-3",
      endpointName: "fixture_listener_endpoint",
      payload: {},
      shareSessionId: null,
    });

    const secondSocket = TestWebSocket.instances[1];
    if (!secondSocket) {
      throw new Error("Expected second listener websocket to be created.");
    }
    secondSocket.fail();

    await expect(brokenSocketPromise).rejects.toThrow(
      "Listener endpoint websocket failed before fixture_listener_endpoint completed.",
    );
  });
});
