import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  useShareSession,
  routeRestartLanguageServerMock,
  addTemporaryNotificationMock,
} = vi.hoisted(() => {
  function createStore<T extends Record<string, unknown>>(initial: T) {
    let state = { ...initial };
    return {
      getState: () => state,
      setState: (next: Partial<T> | ((prev: T) => Partial<T>)) => {
        const patch = typeof next === "function" ? next(state) : next;
        state = { ...state, ...patch };
      },
      reset: () => {
        state = { ...initial };
      },
    };
  }

  return {
    useShareSession: createStore({
      isDeploymentMode: false,
    }),
    routeRestartLanguageServerMock: vi.fn(),
    addTemporaryNotificationMock: vi.fn(),
  };
});

vi.mock("state/definitions", () => ({
  useShareSession,
  useWaitingForLSPResult: {
    setState: vi.fn(),
  },
}));

vi.mock("utils/generatedEndpoints", () => ({
  route_restart_language_server: routeRestartLanguageServerMock,
}));

vi.mock("./notifications", () => ({
  addTemporaryNotification: addTemporaryNotificationMock,
}));

import { restartLanguageServer } from "./lsp";

describe("restartLanguageServer", () => {
  beforeEach(() => {
    useShareSession.reset();
    routeRestartLanguageServerMock.mockReset();
    addTemporaryNotificationMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("posts the restart request in IDE mode", () => {
    restartLanguageServer();

    expect(addTemporaryNotificationMock).toHaveBeenCalledWith(
      "Restarting Language Server",
    );
    expect(routeRestartLanguageServerMock).toHaveBeenCalledOnce();
  });

  it("skips the restart request in deployment mode", () => {
    useShareSession.setState({ isDeploymentMode: true });

    restartLanguageServer();

    expect(addTemporaryNotificationMock).not.toHaveBeenCalled();
    expect(routeRestartLanguageServerMock).not.toHaveBeenCalled();
  });
});
