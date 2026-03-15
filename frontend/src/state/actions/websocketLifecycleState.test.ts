import { beforeEach, describe, expect, it, vi } from "vitest";

type WebsocketLifecycleStateModule = typeof import("./websocketLifecycleState");

describe("websocket lifecycle state", () => {
  let lifecycleState: WebsocketLifecycleStateModule;

  beforeEach(async () => {
    vi.resetModules();
    lifecycleState = await import("./websocketLifecycleState");
  });

  it("tracks last reconnect targets separately from the active socket target", () => {
    lifecycleState.rememberWebsocketTarget("/project", null);
    lifecycleState.setCurrentWebsocketTarget("WEBSOCKET_FRONTEND", null);

    expect(
      lifecycleState.matchesCurrentWebsocketTarget("WEBSOCKET_FRONTEND", null),
    ).toBe(true);
    expect(lifecycleState.getLastWebsocketTarget("/fallback")).toEqual({
      pathname: "/project",
      shareSessionId: null,
    });

    lifecycleState.rememberWebsocketTarget("/share", "share-session-1");
    lifecycleState.setCurrentWebsocketTarget(
      "WEBSOCKET_SHARE_FRONTEND",
      "share-session-1",
    );

    expect(
      lifecycleState.matchesCurrentWebsocketTarget(
        "WEBSOCKET_SHARE_FRONTEND",
        "share-session-1",
      ),
    ).toBe(true);
    expect(lifecycleState.getCurrentWebsocketShareSessionId()).toBe(
      "share-session-1",
    );
    expect(lifecycleState.getLastWebsocketTarget("/fallback")).toEqual({
      pathname: "/share",
      shareSessionId: "share-session-1",
    });

    lifecycleState.clearCurrentWebsocketTarget();

    expect(
      lifecycleState.matchesCurrentWebsocketTarget(
        "WEBSOCKET_SHARE_FRONTEND",
        "share-session-1",
      ),
    ).toBe(false);
    expect(lifecycleState.getCurrentWebsocketShareSessionId()).toBeNull();
  });

  it("treats open-state consumption as a one-shot flag", () => {
    expect(lifecycleState.consumeWasWebsocketOpen()).toBe(false);

    lifecycleState.markWebsocketOpen();

    expect(lifecycleState.consumeWasWebsocketOpen()).toBe(true);
    expect(lifecycleState.consumeWasWebsocketOpen()).toBe(false);

    lifecycleState.markWebsocketOpen();
    lifecycleState.clearWasWebsocketOpen();

    expect(lifecycleState.consumeWasWebsocketOpen()).toBe(false);
  });
});
