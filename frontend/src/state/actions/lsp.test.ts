import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { restartLanguageServer } from "./lsp";

let isDeploymentMode = false;

const {
  callOpenAPIMock,
  restartLanguageServerRouteMock,
  addTemporaryNotificationMock,
} = vi.hoisted(() => ({
  callOpenAPIMock: vi.fn(),
  restartLanguageServerRouteMock: vi.fn(() => ({
    route: "restartLanguageServer",
  })),
  addTemporaryNotificationMock: vi.fn(),
}));

vi.mock("openapi/http", () => ({
  restartLanguageServer: restartLanguageServerRouteMock,
}));

vi.mock("openapi/http/result", () => ({
  callOpenAPI: callOpenAPIMock,
}));

vi.mock("state/definitions", () => ({
  useShareSession: {
    getState: () => ({
      isDeploymentMode,
    }),
  },
  useWaitingForLSPResult: {
    setState: vi.fn(),
  },
}));

vi.mock("./notifications", () => ({
  addTemporaryNotification: addTemporaryNotificationMock,
}));

async function drainMicrotasks(iterations = 8): Promise<void> {
  for (let index = 0; index < iterations; index += 1) {
    await Promise.resolve();
  }
}

describe("restartLanguageServer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isDeploymentMode = false;
    callOpenAPIMock.mockResolvedValue({
      data: null,
      response: new Response(null, { status: 200 }),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("requests restart through the OpenAPI route", async () => {
    restartLanguageServer();
    await drainMicrotasks();

    expect(addTemporaryNotificationMock).toHaveBeenCalledWith(
      "Restarting Language Server",
    );
    expect(restartLanguageServerRouteMock).toHaveBeenCalledTimes(1);
    expect(callOpenAPIMock).toHaveBeenCalledWith({
      route: "restartLanguageServer",
    });
  });

  it("does nothing in deployment mode", async () => {
    isDeploymentMode = true;

    restartLanguageServer();
    await drainMicrotasks();

    expect(addTemporaryNotificationMock).not.toHaveBeenCalled();
    expect(restartLanguageServerRouteMock).not.toHaveBeenCalled();
    expect(callOpenAPIMock).not.toHaveBeenCalled();
  });
});
