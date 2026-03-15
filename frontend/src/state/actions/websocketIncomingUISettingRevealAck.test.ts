import { NULL_PROJECT_CONFIG_ID } from "state/definitions";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createNewIdMock } = vi.hoisted(() => ({
  createNewIdMock: vi.fn(),
}));

vi.mock("utils/idNameCreation", async () => {
  const actual = await vi.importActual<typeof import("utils/idNameCreation")>(
    "utils/idNameCreation",
  );
  return {
    ...actual,
    createNewId: () => createNewIdMock(),
  };
});

import type { FrontendWebsocketMessageContext } from "./websocketIncomingTypes";
import {
  buildMalformedRevealStatuses,
  resolveRevealProjectConfigId,
  resolveRevealRequestId,
  sendUISettingRevealResult,
} from "./websocketIncomingUISettingRevealAck";

describe("websocketIncomingUISettingRevealAck", () => {
  beforeEach(() => {
    createNewIdMock.mockReset();
  });

  it("falls back to the null project id when the payload omits a usable project id", () => {
    // Malformed websocket payloads still need a stable project id for the ACK.
    expect(resolveRevealProjectConfigId(null, "")).toBe(NULL_PROJECT_CONFIG_ID);
    expect(
      resolveRevealProjectConfigId({ projectConfigId: "project-1" }, ""),
    ).toBe("project-1");
  });

  it("extracts malformed reveal statuses only for targets that still expose ids", () => {
    // Only reveal targets with a surviving setting id can report a failed ACK.
    expect(
      buildMalformedRevealStatuses(
        {
          reveals: [
            { settingId: "core.watch_code.enabled" },
            { settingId: "" },
            { other: "value" },
            null,
          ],
        },
        "Invalid UISettingReveal payload.",
      ),
    ).toEqual([
      {
        settingId: "core.watch_code.enabled",
        status: "failed",
        errorCode: "mutation_failed",
        errorMessage: "Invalid UISettingReveal payload.",
      },
    ]);
  });

  it("uses the payload request id when present and generates one otherwise", () => {
    createNewIdMock.mockReturnValue("generated-request-id");

    // Downstream ACK routing should preserve explicit request ids when present.
    expect(resolveRevealRequestId({ requestId: "request-1" })).toBe(
      "request-1",
    );
    expect(resolveRevealRequestId({ requestId: "   " })).toBe(
      "generated-request-id",
    );
  });

  it("sends ACK results on the current websocket generation", () => {
    const sendMessageForGeneration = vi.fn();
    const context: FrontendWebsocketMessageContext = {
      socketGeneration: 9,
      isSocketGenerationCurrent: () => true,
      isSocketOpen: () => true,
      sendMessageForGeneration,
    };

    // ACK payloads should stay pinned to the socket generation that received them.
    sendUISettingRevealResult({
      projectConfigId: "project-1",
      requestId: "request-1",
      statuses: [],
      context,
    });

    expect(sendMessageForGeneration).toHaveBeenCalledWith(
      {
        id: null,
        messageType: "UISettingRevealResult",
        content: {
          projectConfigId: "project-1",
          requestId: "request-1",
          statuses: [],
        },
      },
      9,
    );
  });
});
