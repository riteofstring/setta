import { useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("state/actions/uiSettingRevealRequests", () => ({
  receiveUISettingReveal: vi.fn(),
}));

import { receiveUISettingReveal } from "./uiSettingRevealRequests";
import type { FrontendWebsocketMessageContext } from "./websocketIncomingTypes";
import {
  buildRevealExecutionContext,
  executeIncomingUISettingReveal,
} from "./websocketIncomingUISettingRevealExecution";

function buildRevealContent() {
  return {
    projectConfigId: "project-1",
    chatId: null,
    requestId: "request-1",
    durationMs: 1500,
    reveals: [
      {
        settingId: "core.watch_code.enabled",
        side: "left",
        overviewTabKey: "WatchCode",
        uiEditorTabName: null,
        pluginId: null,
        paneId: null,
        strategy: "dom_anchor" as const,
        anchorId: "core.watch_code.enabled",
        pluginRevealKey: null,
        revealActivationSteps: [],
      },
    ],
  };
}

describe("websocketIncomingUISettingRevealExecution", () => {
  beforeEach(() => {
    resetProjectStores();
    useProjectState.setState((state) => {
      state.projectConfig.id = "project-1";
    });
    vi.mocked(receiveUISettingReveal).mockReset();
  });

  it("builds execution context from the parsed reveal content and websocket context", () => {
    const websocketContext: FrontendWebsocketMessageContext = {
      socketGeneration: 4,
      isSocketGenerationCurrent: (generation) => generation === 4,
      isSocketOpen: () => true,
      sendMessageForGeneration: vi.fn(),
    };

    // The execution helper should capture the request/project/socket tuple once.
    expect(
      buildRevealExecutionContext(buildRevealContent(), websocketContext),
    ).toEqual(
      expect.objectContaining({
        requestId: "request-1",
        requestedProjectConfigId: "project-1",
        socketGeneration: 4,
      }),
    );
  });

  it("normalizes thrown reveal failures into per-setting ACK statuses", async () => {
    vi.mocked(receiveUISettingReveal).mockRejectedValue(
      new Error("reveal crashed"),
    );
    const executionContext = {
      requestId: "request-1",
      requestedProjectConfigId: "project-1",
      socketGeneration: 1,
      isSocketGenerationActive: () => true,
    };

    // Store-write failures must still resolve into deterministic per-target ACK errors.
    await expect(
      executeIncomingUISettingReveal(buildRevealContent(), executionContext),
    ).resolves.toEqual([
      {
        settingId: "core.watch_code.enabled",
        status: "failed",
        errorCode: "mutation_failed",
        errorMessage: "Failed to process UI setting reveal: reveal crashed",
      },
    ]);
  });

  it("overrides reveal results with a context mismatch after execution finishes", async () => {
    let isSocketGenerationActive = true;
    vi.mocked(receiveUISettingReveal).mockImplementation(async () => {
      isSocketGenerationActive = false;
      return [
        {
          settingId: "core.watch_code.enabled",
          status: "revealed",
          errorCode: null,
          errorMessage: null,
        },
      ];
    });

    // Successful writes are invalid once the owning websocket generation changes.
    await expect(
      executeIncomingUISettingReveal(buildRevealContent(), {
        requestId: "request-1",
        requestedProjectConfigId: "project-1",
        socketGeneration: 1,
        isSocketGenerationActive: () => isSocketGenerationActive,
      }),
    ).resolves.toEqual([
      {
        settingId: "core.watch_code.enabled",
        status: "failed",
        errorCode: "mutation_failed",
        errorMessage:
          "UI setting reveal execution context mismatch: websocket generation changed before request request-1 completed.",
      },
    ]);
  });

  it("overrides reveal results when the active project changes before ACK", async () => {
    vi.mocked(receiveUISettingReveal).mockImplementation(async () => {
      useProjectState.setState((state) => {
        state.projectConfig.id = "project-2";
      });
      return [
        {
          settingId: "core.watch_code.enabled",
          status: "revealed",
          errorCode: null,
          errorMessage: null,
        },
      ];
    });

    // ACKs should fail closed if the active project no longer matches the request.
    await expect(
      executeIncomingUISettingReveal(buildRevealContent(), {
        requestId: "request-1",
        requestedProjectConfigId: "project-1",
        socketGeneration: 1,
        isSocketGenerationActive: () => true,
      }),
    ).resolves.toEqual([
      {
        settingId: "core.watch_code.enabled",
        status: "failed",
        errorCode: "mutation_failed",
        errorMessage:
          "UI setting reveal execution context mismatch: requested project project-1 but active project is project-2.",
      },
    ]);
  });
});
