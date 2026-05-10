import { useProjectState } from "state/definitions";
import { WebsocketMessageTypeEnum } from "utils/generatedTypes";
import { describe, expect, it, vi } from "vitest";
import {
  MockWebSocket,
  buildUISettingRevealMessage,
  expectedAuthRecoveryNotification,
  findRevealResultPayload,
  registerOpenWebSocketTestHooks,
} from "./websocketReceive.testHelpers";

describe("openWebSocket UI setting reveal", () => {
  registerOpenWebSocketTestHooks();
  it("routes UISettingReveal websocket messages to the reveal action", async () => {
    useProjectState.setState((state) => {
      state.projectConfig.id = "project-1";
    });
    const { openWebSocket } = await import("state/actions/websocketReceive");
    const { receiveUISettingReveal } = await import(
      "state/actions/uiSettingReveal"
    );
    const { getAuthRefreshStatus } = await import("openapi/http");
    vi.mocked(getAuthRefreshStatus).mockResolvedValue({
      status: 200,
      data: { authCookieRefreshWindowSeconds: 120 },
      hasResponse: true,
    });
    vi.mocked(receiveUISettingReveal).mockResolvedValue([
      {
        settingId: "plugin::setta-watch-code::files",
        status: "revealed",
        errorCode: null,
        errorMessage: null,
      },
    ]);
    openWebSocket("/project");
    vi.runAllTimers();
    const socket = MockWebSocket.instances[0];
    await socket.emit("open");
    await socket.emit("message", {
      data: JSON.stringify({
        id: "msg-1",
        messageType: WebsocketMessageTypeEnum.UISettingReveal,
        content: {
          projectConfigId: "project-1",
          chatId: null,
          requestId: "request-1",
          durationMs: 1500,
          reveals: [
            {
              settingId: "plugin::setta-watch-code::files",
              side: "left",
              overviewTabKey: "WatchCode",
              uiEditorTabName: null,
              pluginId: null,
              paneId: null,
              strategy: "dom_anchor",
              anchorId: "plugin::setta-watch-code::files",
              pluginRevealKey: null,
              revealActivationSteps: [
                {
                  type: "run_instructions_accordion_item",
                  itemValue: "run-instructions-codegen-targets",
                },
              ],
            },
          ],
        },
      }),
    });
    await Promise.resolve();
    expect(receiveUISettingReveal).toHaveBeenCalledTimes(1);
    expect(receiveUISettingReveal).toHaveBeenCalledWith(
      expect.objectContaining({
        reveals: [
          expect.objectContaining({
            settingId: "plugin::setta-watch-code::files",
            revealActivationSteps: [
              {
                type: "run_instructions_accordion_item",
                itemValue: "run-instructions-codegen-targets",
              },
            ],
          }),
        ],
      }),
      expect.objectContaining({
        requestId: "request-1",
        requestedProjectConfigId: "project-1",
        socketGeneration: expect.any(Number),
      }),
    );
    const revealResultPayload = socket.send.mock.calls
      .map((call) => call[0])
      .filter((payload): payload is string => typeof payload === "string")
      .map((payload) => {
        try {
          return JSON.parse(payload) as {
            messageType?: string;
            content?: {
              requestId?: string;
              statuses?: unknown;
            };
          };
        } catch {
          return null;
        }
      })
      .find(
        (payload) =>
          payload?.messageType === "UISettingRevealResult" &&
          payload.content?.requestId === "request-1",
      );
    expect(revealResultPayload).not.toBeUndefined();
    expect(revealResultPayload?.content?.statuses).toEqual([
      {
        settingId: "plugin::setta-watch-code::files",
        status: "revealed",
        errorCode: null,
        errorMessage: null,
      },
    ]);
  });
  it("processes UISettingReveal messages concurrently within one websocket generation", async () => {
    useProjectState.setState((state) => {
      state.projectConfig.id = "project-1";
    });
    const { openWebSocket } = await import("state/actions/websocketReceive");
    const { receiveUISettingReveal } = await import(
      "state/actions/uiSettingReveal"
    );
    const { getAuthRefreshStatus } = await import("openapi/http");
    vi.mocked(getAuthRefreshStatus).mockResolvedValue({
      status: 200,
      data: { authCookieRefreshWindowSeconds: 120 },
      hasResponse: true,
    });
    let resolveFirstReveal:
      | ((
          value: Array<{
            settingId: string;
            status: "revealed" | "failed";
            errorCode: string | null;
            errorMessage: string | null;
          }>,
        ) => void)
      | null = null;
    const firstRevealPromise = new Promise<
      Array<{
        settingId: string;
        status: "revealed" | "failed";
        errorCode: string | null;
        errorMessage: string | null;
      }>
    >((resolve) => {
      resolveFirstReveal = resolve;
    });
    vi.mocked(receiveUISettingReveal)
      .mockImplementationOnce(() => firstRevealPromise)
      .mockResolvedValueOnce([
        {
          settingId: "core.project.name",
          status: "revealed",
          errorCode: null,
          errorMessage: null,
        },
      ]);
    openWebSocket("/project");
    vi.runAllTimers();
    const socket = MockWebSocket.instances[0];
    await socket.emit("open");
    await socket.emit("message", {
      data: JSON.stringify(
        buildUISettingRevealMessage({
          id: "msg-queue-1",
          requestId: "request-queue-1",
          settingId: "plugin::setta-watch-code::files",
        }),
      ),
    });
    await socket.emit("message", {
      data: JSON.stringify(
        buildUISettingRevealMessage({
          id: "msg-queue-2",
          requestId: "request-queue-2",
          settingId: "core.project.name",
        }),
      ),
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(receiveUISettingReveal).toHaveBeenCalledTimes(2);
    if (resolveFirstReveal === null) {
      throw new Error("Missing first reveal resolver.");
    }
    resolveFirstReveal([
      {
        settingId: "plugin::setta-watch-code::files",
        status: "revealed",
        errorCode: null,
        errorMessage: null,
      },
    ]);
    for (let i = 0; i < 5; i += 1) {
      await Promise.resolve();
    }
    const firstAck = findRevealResultPayload(socket, "request-queue-1");
    const secondAck = findRevealResultPayload(socket, "request-queue-2");
    expect(firstAck?.statuses).toEqual([
      {
        settingId: "plugin::setta-watch-code::files",
        status: "revealed",
        errorCode: null,
        errorMessage: null,
      },
    ]);
    expect(secondAck?.statuses).toEqual([
      {
        settingId: "core.project.name",
        status: "revealed",
        errorCode: null,
        errorMessage: null,
      },
    ]);
  });
  it("does not send UISettingReveal ACKs after websocket generation rollover", async () => {
    const { openWebSocket } = await import("state/actions/websocketReceive");
    const { receiveUISettingReveal } = await import(
      "state/actions/uiSettingReveal"
    );
    const { getAuthRefreshStatus } = await import("openapi/http");
    vi.mocked(getAuthRefreshStatus).mockResolvedValue({
      status: 200,
      data: { authCookieRefreshWindowSeconds: 120 },
      hasResponse: true,
    });
    let resolveReveal:
      | ((
          value: Array<{
            settingId: string;
            status: "revealed" | "failed";
            errorCode: string | null;
            errorMessage: string | null;
          }>,
        ) => void)
      | null = null;
    const revealPromise = new Promise<
      Array<{
        settingId: string;
        status: "revealed" | "failed";
        errorCode: string | null;
        errorMessage: string | null;
      }>
    >((resolve) => {
      resolveReveal = resolve;
    });
    vi.mocked(receiveUISettingReveal).mockImplementation(() => revealPromise);
    openWebSocket("/project");
    vi.runAllTimers();
    const originalSocket = MockWebSocket.instances[0];
    await originalSocket.emit("open");
    await originalSocket.emit("message", {
      data: JSON.stringify(
        buildUISettingRevealMessage({
          id: "msg-rollover-1",
          requestId: "request-rollover-1",
          settingId: "plugin::setta-watch-code::files",
        }),
      ),
    });
    await Promise.resolve();
    openWebSocket("/project", "share-session-replacement");
    vi.advanceTimersByTime(1000);
    const replacementSocket = MockWebSocket.instances[1];
    await replacementSocket.emit("open");
    if (resolveReveal === null) {
      throw new Error("Missing reveal resolver.");
    }
    resolveReveal([
      {
        settingId: "plugin::setta-watch-code::files",
        status: "revealed",
        errorCode: null,
        errorMessage: null,
      },
    ]);
    await Promise.resolve();
    await Promise.resolve();
    expect(
      findRevealResultPayload(originalSocket, "request-rollover-1"),
    ).toBeUndefined();
    expect(
      findRevealResultPayload(replacementSocket, "request-rollover-1"),
    ).toBeUndefined();
  });
  it("sends structured reveal failure statuses when reveal handling throws", async () => {
    useProjectState.setState((state) => {
      state.projectConfig.id = "project-1";
    });
    const { openWebSocket } = await import("state/actions/websocketReceive");
    const { receiveUISettingReveal } = await import(
      "state/actions/uiSettingReveal"
    );
    const { getAuthRefreshStatus } = await import("openapi/http");
    vi.mocked(getAuthRefreshStatus).mockResolvedValue({
      status: 200,
      data: { authCookieRefreshWindowSeconds: 120 },
      hasResponse: true,
    });
    vi.mocked(receiveUISettingReveal).mockRejectedValue(
      new Error("reveal crashed"),
    );
    openWebSocket("/project", "share-session-reveal-error");
    vi.runAllTimers();
    const socket = MockWebSocket.instances[0];
    await socket.emit("open");
    await socket.emit("message", {
      data: JSON.stringify({
        id: "msg-2",
        messageType: WebsocketMessageTypeEnum.UISettingReveal,
        content: {
          projectConfigId: "project-1",
          chatId: null,
          requestId: "request-2",
          durationMs: 1500,
          reveals: [
            {
              settingId: "plugin::setta-watch-code::files",
              side: "left",
              overviewTabKey: "WatchCode",
              uiEditorTabName: null,
              pluginId: null,
              paneId: null,
              strategy: "dom_anchor",
              anchorId: "plugin::setta-watch-code::files",
              pluginRevealKey: null,
              revealActivationSteps: [],
            },
          ],
        },
      }),
    });
    await Promise.resolve();
    const revealResultPayload = socket.send.mock.calls
      .map((call) => call[0])
      .filter((payload): payload is string => typeof payload === "string")
      .map((payload) => {
        try {
          return JSON.parse(payload) as {
            messageType?: string;
            content?: {
              requestId?: string;
              statuses?: unknown;
            };
          };
        } catch {
          return null;
        }
      })
      .find(
        (payload) =>
          payload?.messageType === "UISettingRevealResult" &&
          payload.content?.requestId === "request-2",
      );
    expect(revealResultPayload?.content?.statuses).toEqual([
      {
        settingId: "plugin::setta-watch-code::files",
        status: "failed",
        errorCode: "mutation_failed",
        errorMessage: "Failed to process UI setting reveal: reveal crashed",
      },
    ]);
  });
  it("acks malformed UISettingReveal payloads without throwing", async () => {
    const { openWebSocket } = await import("state/actions/websocketReceive");
    const { receiveUISettingReveal } = await import(
      "state/actions/uiSettingReveal"
    );
    const { getAuthRefreshStatus } = await import("openapi/http");
    vi.mocked(getAuthRefreshStatus).mockResolvedValue({
      status: 200,
      data: { authCookieRefreshWindowSeconds: 120 },
      hasResponse: true,
    });
    openWebSocket("/project", "share-session-reveal-malformed");
    vi.runAllTimers();
    const socket = MockWebSocket.instances[0];
    await socket.emit("open");
    await socket.emit("message", {
      data: JSON.stringify({
        id: "msg-3",
        messageType: WebsocketMessageTypeEnum.UISettingReveal,
        content: {
          projectConfigId: "project-1",
          chatId: null,
          requestId: "request-3",
          durationMs: 1500,
          reveals: null,
        },
      }),
    });
    await Promise.resolve();
    expect(receiveUISettingReveal).not.toHaveBeenCalled();
    const revealResultPayload = socket.send.mock.calls
      .map((call) => call[0])
      .filter((payload): payload is string => typeof payload === "string")
      .map((payload) => {
        try {
          return JSON.parse(payload) as {
            messageType?: string;
            content?: {
              requestId?: string;
              statuses?: unknown;
            };
          };
        } catch {
          return null;
        }
      })
      .find(
        (payload) =>
          payload?.messageType === "UISettingRevealResult" &&
          payload.content?.requestId === "request-3",
      );
    expect(revealResultPayload).not.toBeUndefined();
    expect(revealResultPayload?.content?.statuses).toEqual([]);
  });
  it("returns structured failure statuses for malformed reveal targets when ids are available", async () => {
    const { openWebSocket } = await import("state/actions/websocketReceive");
    const { getAuthRefreshStatus } = await import("openapi/http");
    vi.mocked(getAuthRefreshStatus).mockResolvedValue({
      status: 200,
      data: { authCookieRefreshWindowSeconds: 120 },
      hasResponse: true,
    });
    openWebSocket("/project", "share-session-reveal-malformed-target");
    vi.runAllTimers();
    const socket = MockWebSocket.instances[0];
    await socket.emit("open");
    await socket.emit("message", {
      data: JSON.stringify({
        id: "msg-4",
        messageType: WebsocketMessageTypeEnum.UISettingReveal,
        content: {
          projectConfigId: "project-1",
          chatId: null,
          requestId: "request-4",
          durationMs: 1500,
          reveals: [
            {
              settingId: "plugin::setta-watch-code::files",
              side: "left",
              overviewTabKey: "WatchCode",
              uiEditorTabName: null,
              pluginId: null,
              paneId: null,
              strategy: "dom_anchor",
              anchorId: "plugin::setta-watch-code::files",
              pluginRevealKey: null,
              revealActivationSteps: {},
            },
          ],
        },
      }),
    });
    await Promise.resolve();
    const revealResultPayload = socket.send.mock.calls
      .map((call) => call[0])
      .filter((payload): payload is string => typeof payload === "string")
      .map((payload) => {
        try {
          return JSON.parse(payload) as {
            messageType?: string;
            content?: {
              requestId?: string;
              statuses?: unknown;
            };
          };
        } catch {
          return null;
        }
      })
      .find(
        (payload) =>
          payload?.messageType === "UISettingRevealResult" &&
          payload.content?.requestId === "request-4",
      );
    expect(revealResultPayload?.content?.statuses).toEqual([
      {
        settingId: "plugin::setta-watch-code::files",
        status: "failed",
        errorCode: "mutation_failed",
        errorMessage: "Invalid UISettingReveal payload.",
      },
    ]);
  });
  it("uses the Go bootstrap root route in auth recovery notifications", async () => {
    const { openWebSocket } = await import("state/actions/websocketReceive");
    const { addTemporaryNotification } = await import(
      "state/actions/notifications"
    );
    openWebSocket("/project");
    vi.runAllTimers();
    const socket = MockWebSocket.instances[0];
    await socket.emit("open");
    vi.mocked(addTemporaryNotification).mockClear();
    await socket.emit("close", { code: 4401 });
    expect(addTemporaryNotification).toHaveBeenCalledWith(
      expectedAuthRecoveryNotification(),
    );
  });
});
