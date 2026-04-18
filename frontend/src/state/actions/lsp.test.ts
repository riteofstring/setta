import { beforeEach, describe, expect, it, vi } from "vitest";

import { NotificationTypeEnum } from "utils/generatedTypes";

const {
  callOpenAPIMock,
  addTemporaryNotificationMock,
  refreshPluginRuntimeMock,
  restartLanguageServerRouteMock,
  shareSessionState,
} = vi.hoisted(() => ({
  callOpenAPIMock: vi.fn(),
  addTemporaryNotificationMock: vi.fn(),
  refreshPluginRuntimeMock: vi.fn(),
  restartLanguageServerRouteMock: vi.fn(),
  shareSessionState: { isDeploymentMode: false },
}));

vi.mock("openapi/http", () => ({
  restartLanguageServer: restartLanguageServerRouteMock,
}));

vi.mock("openapi/http/result", () => ({
  callOpenAPI: callOpenAPIMock,
}));

vi.mock("plugins/runtime", () => ({
  refreshPluginRuntime: refreshPluginRuntimeMock,
}));

vi.mock("state/definitions", () => ({
  useShareSession: {
    getState: () => shareSessionState,
  },
  useWaitingForLSPResult: {
    setState: vi.fn(),
  },
}));

vi.mock("./notifications", () => ({
  addTemporaryNotification: addTemporaryNotificationMock,
}));

import { restartLanguageServer } from "./lsp";

describe("restartLanguageServer", () => {
  beforeEach(() => {
    shareSessionState.isDeploymentMode = false;
    callOpenAPIMock.mockReset();
    addTemporaryNotificationMock.mockReset();
    refreshPluginRuntimeMock.mockReset();
    refreshPluginRuntimeMock.mockResolvedValue(undefined);
    restartLanguageServerRouteMock.mockReset();
    restartLanguageServerRouteMock.mockResolvedValue({
      data: null,
      response: { status: 200 },
    });
  });

  it("shows success copy only when restart succeeds", async () => {
    callOpenAPIMock.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: null,
    });

    await restartLanguageServer();

    expect(restartLanguageServerRouteMock).toHaveBeenCalledTimes(1);
    expect(callOpenAPIMock).toHaveBeenCalledTimes(1);
    expect(addTemporaryNotificationMock).toHaveBeenCalledWith(
      "Restarting Language Server",
    );
    expect(refreshPluginRuntimeMock).toHaveBeenCalledTimes(1);
  });

  it("surfaces the backend 409 guidance instead of optimistic success copy", async () => {
    callOpenAPIMock.mockResolvedValue({
      status: 409,
      hasResponse: true,
      data: {
        error: {
          code: "language_server_not_configured",
          message:
            "Language server is not configured. Select a plugin and restart after it is available.",
        },
      },
    });

    await restartLanguageServer();

    expect(addTemporaryNotificationMock).toHaveBeenCalledTimes(1);
    expect(addTemporaryNotificationMock).toHaveBeenCalledWith(
      "Language server is not configured. Select a plugin and restart after it is available.",
      NotificationTypeEnum.error,
    );
    expect(addTemporaryNotificationMock).not.toHaveBeenCalledWith(
      "Restarting Language Server",
    );
    expect(refreshPluginRuntimeMock).not.toHaveBeenCalled();
  });

  it("does nothing in deployment mode", async () => {
    shareSessionState.isDeploymentMode = true;

    await restartLanguageServer();

    expect(restartLanguageServerRouteMock).not.toHaveBeenCalled();
    expect(callOpenAPIMock).not.toHaveBeenCalled();
    expect(addTemporaryNotificationMock).not.toHaveBeenCalled();
    expect(refreshPluginRuntimeMock).not.toHaveBeenCalled();
  });
});
